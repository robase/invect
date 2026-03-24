#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import readline from "node:readline/promises";
import process from "node:process";

const RESERVED_PORTS = [3000, 3002, 5173];
const KILL_WAIT_MS = 2_000;

function parseCliArgs(argv) {
  const passthroughArgs = [];
  let autoKill = false;
  let autoForceKill = false;

  for (const arg of argv) {
    if (arg === "--kill-ports") {
      autoKill = true;
      continue;
    }

    if (arg === "--force-kill-ports") {
      autoForceKill = true;
      continue;
    }

    passthroughArgs.push(arg);
  }

  if (autoForceKill) {
    autoKill = false;
  }

  return { autoKill, autoForceKill, passthroughArgs };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getListeningProcesses(port) {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpcn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    const processes = [];
    let current = null;

    for (const rawLine of output.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const prefix = line[0];
      const value = line.slice(1);

      if (prefix === "p") {
        if (current?.pid) {
          processes.push(current);
        }
        current = { pid: Number.parseInt(value, 10), command: "unknown", endpoint: "" };
        continue;
      }

      if (!current) {
        continue;
      }

      if (prefix === "c") {
        current.command = value;
        continue;
      }

      if (prefix === "n") {
        current.endpoint = value;
      }
    }

    if (current?.pid) {
      processes.push(current);
    }

    return processes;
  } catch {
    return [];
  }
}

function getPortConflicts() {
  return RESERVED_PORTS.flatMap((port) =>
    getListeningProcesses(port).map((processInfo) => ({ port, ...processInfo })),
  );
}

function dedupeProcesses(conflicts) {
  const uniqueProcesses = new Map();

  for (const conflict of conflicts) {
    const existing = uniqueProcesses.get(conflict.pid);
    if (existing) {
      existing.ports.add(conflict.port);
      continue;
    }

    uniqueProcesses.set(conflict.pid, {
      pid: conflict.pid,
      command: conflict.command,
      endpoint: conflict.endpoint,
      ports: new Set([conflict.port]),
    });
  }

  return [...uniqueProcesses.values()].sort((left, right) => left.pid - right.pid);
}

function printConflicts(conflicts) {
  const uniqueProcesses = dedupeProcesses(conflicts);

  console.error("Playwright preflight found occupied ports:");
  for (const processInfo of uniqueProcesses) {
    const ports = [...processInfo.ports].sort((left, right) => left - right).join(", ");
    const endpoint = processInfo.endpoint ? ` ${processInfo.endpoint}` : "";
    console.error(`  - ports ${ports}: pid ${processInfo.pid} (${processInfo.command})${endpoint}`);
  }
}

async function promptForAction(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(message);
    return answer.trim().toLowerCase();
  } finally {
    rl.close();
  }
}

function sendSignal(processes, signal) {
  for (const processInfo of processes) {
    try {
      process.kill(processInfo.pid, signal);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
        continue;
      }
      throw error;
    }
  }
}

async function clearReservedPorts({ autoKill, autoForceKill }) {
  let conflicts = getPortConflicts();
  if (conflicts.length === 0) {
    return;
  }

  printConflicts(conflicts);

  let selectedMode = null;
  if (autoForceKill) {
    selectedMode = "force";
  } else if (autoKill) {
    selectedMode = "kill";
  } else if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Reserved Playwright ports are busy. Re-run with --kill-ports or --force-kill-ports to clear them automatically.");
    process.exit(1);
  } else {
    const answer = await promptForAction(
      "Kill these processes before running Playwright? [k]ill / [f]orce kill / [c]ancel: ",
    );
    if (answer === "k" || answer === "kill" || answer === "y" || answer === "yes") {
      selectedMode = "kill";
    } else if (answer === "f" || answer === "force" || answer === "force-kill") {
      selectedMode = "force";
    } else {
      console.error("Playwright run cancelled.");
      process.exit(1);
    }
  }

  const uniqueProcesses = dedupeProcesses(conflicts);
  const initialSignal = selectedMode === "force" ? "SIGKILL" : "SIGTERM";
  sendSignal(uniqueProcesses, initialSignal);

  if (selectedMode !== "force") {
    await sleep(KILL_WAIT_MS);
    conflicts = getPortConflicts();

    if (conflicts.length > 0) {
      if (autoKill) {
        console.error("Some processes ignored SIGTERM. Re-run with --force-kill-ports to send SIGKILL.");
        process.exit(1);
      }

      printConflicts(conflicts);
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Some processes ignored SIGTERM. Re-run with --force-kill-ports to send SIGKILL.");
        process.exit(1);
      }

      const escalation = await promptForAction(
        "Some processes ignored SIGTERM. Force kill them with SIGKILL? [f]orce kill / [c]ancel: ",
      );
      if (escalation === "f" || escalation === "force" || escalation === "force-kill") {
        sendSignal(dedupeProcesses(conflicts), "SIGKILL");
        await sleep(500);
      } else {
        console.error("Playwright run cancelled.");
        process.exit(1);
      }
    }
  } else {
    await sleep(500);
  }

  conflicts = getPortConflicts();
  if (conflicts.length > 0) {
    printConflicts(conflicts);
    console.error("Failed to free required Playwright ports.");
    process.exit(1);
  }
}

function runPlaywright(args) {
  const child = spawn(
    "npx",
    ["playwright", "test", "--config", "playwright/playwright.config.ts", ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

async function main() {
  const { autoKill, autoForceKill, passthroughArgs } = parseCliArgs(process.argv.slice(2));
  await clearReservedPorts({ autoKill, autoForceKill });
  runPlaywright(passthroughArgs);
}

await main();
