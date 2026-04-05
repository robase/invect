import { test as base, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export { expect };

export interface ServerFixture {
  apiBase: string;
  serverUrl: string;
}

export interface SqliteServerOptions {
  apiPrefix: string;
  dbFilePrefix: string;
  readyPath: string;
  serverCwd: string;
  serverScript: string;
}

export interface BrowserIsolationOptions extends SqliteServerOptions {
  apiRoutePrefix?: string;
  sharedOrigin: string;
}

export type BrowserIsolationWorkerFixtures = {
  isolatedServer: ServerFixture;
  apiBase: string;
};

export type BrowserIsolationTestFixtures = {
  _routeInterception: void;
};

async function waitForReady(url: string, stderr: string[], timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      lastStatus = response.status;
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Server at ${url} did not become ready within ${timeoutMs}ms (last status: ${lastStatus}).\nstderr:\n${stderr.join('').slice(-4000)}`,
  );
}

export async function spawnSqliteIsolatedServer(
  options: SqliteServerOptions,
  workerIndex: number,
): Promise<{ fixture: ServerFixture; cleanup: () => Promise<void> }> {
  const dbFile = path.join(os.tmpdir(), `${options.dbFilePrefix}-${workerIndex}-${Date.now()}.db`);

  const child: ChildProcess = spawn('pnpm', ['exec', 'tsx', options.serverScript], {
    cwd: options.serverCwd,
    env: {
      ...process.env,
      PORT: '0',
      TEST_DB_PATH: dbFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stderr: string[] = [];
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString());
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Test server timeout.\nstderr:\n${stderr.join('')}`));
    }, 60_000);

    let stdoutBuffer = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const match = stdoutBuffer.match(/LISTENING:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number.parseInt(match[1], 10));
      }
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Test server exited with code ${code}.\nstderr:\n${stderr.join('')}`));
    });
  });

  const serverUrl = `http://127.0.0.1:${port}`;
  await waitForReady(`${serverUrl}${options.readyPath}`, stderr);

  const cleanup = async () => {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3_000);
      child.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try {
        fs.unlinkSync(dbFile + suffix);
      } catch {
        // File already removed.
      }
    }
  };

  return {
    fixture: {
      apiBase: `${serverUrl}${options.apiPrefix}`,
      serverUrl,
    },
    cleanup,
  };
}

export function createSqliteBrowserIsolationTest(options: BrowserIsolationOptions) {
  return base.extend<BrowserIsolationTestFixtures, BrowserIsolationWorkerFixtures>({
    isolatedServer: [
      async ({}, use, workerInfo) => {
        const { fixture, cleanup } = await spawnSqliteIsolatedServer(
          options,
          workerInfo.workerIndex,
        );
        await use(fixture);
        await cleanup();
      },
      { scope: 'worker' },
    ],

    apiBase: [
      async ({ isolatedServer }, use) => {
        await use(isolatedServer.apiBase);
      },
      { scope: 'worker' },
    ],

    _routeInterception: [
      async ({ page, isolatedServer }, use) => {
        await installApiRouteInterception(
          page,
          options.sharedOrigin,
          options.apiRoutePrefix ?? options.apiPrefix,
          options.apiPrefix,
          isolatedServer.serverUrl,
        );
        await use();
      },
      { auto: true },
    ],
  });
}

export async function installApiRouteInterception(
  page: Page,
  sharedOrigin: string,
  apiRoutePrefix: string,
  targetApiPrefix: string,
  isolatedServerUrl: string,
) {
  await page.route(`${sharedOrigin}${apiRoutePrefix}/**`, async (route) => {
    const requestUrl = route.request().url();

    if (!requestUrl.startsWith(`${sharedOrigin}${apiRoutePrefix}`)) {
      await route.fallback();
      return;
    }

    const rewrittenUrl = requestUrl.replace(
      `${sharedOrigin}${apiRoutePrefix}`,
      `${isolatedServerUrl}${targetApiPrefix}`,
    );
    const headers = await route.request().allHeaders();
    const body = route.request().postDataBuffer();

    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers['content-length'];

    try {
      const response = await fetch(rewrittenUrl, {
        method: route.request().method(),
        headers,
        body: body ? new Uint8Array(body) : undefined,
      });

      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: Buffer.from(await response.arrayBuffer()),
      });
    } catch {
      await route.abort('failed');
    }
  });
}
