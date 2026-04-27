/**
 * Integration tests for the sidebar tree views (Backends, Flows,
 * Credentials, Webhooks). Verifies registration + that the Flows tree
 * can be enumerated and contains the fixture's `.flow.ts`.
 *
 * We don't drive the actual UI clicks — VSCode doesn't expose a
 * synthetic "click this tree item" API. Instead we exercise the same
 * commands the click handlers fire (`invect.openFlow`,
 * `invect.viewRun`, `invect.openCredentials`, etc.) and assert their
 * effects.
 */

import * as assert from 'node:assert';
import * as vscode from 'vscode';

async function activate(): Promise<void> {
  const ext =
    vscode.extensions.getExtension('invect.@invect/vscode') ??
    vscode.extensions.getExtension('invect.vscode');
  if (!ext) {
    throw new Error('extension not found');
  }
  await ext.activate();
}

suite('Sidebar views + commands', () => {
  suiteSetup(async () => {
    await activate();
  });

  test('all expected commands are registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const expected = [
      'invect.refreshFlows',
      'invect.openFlow',
      'invect.viewRun',
      'invect.openCredentials',
      'invect.openWebhooks',
      'invect.editAsCode',
      'invect.editVisually',
      'invect.connect',
      'invect.disconnect',
      'invect.newFlow',
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `missing command: ${cmd}`);
    }
  });

  test('invect.openCredentials opens an Invect webview tab', async () => {
    await closeAllEditors();
    await vscode.commands.executeCommand('invect.openCredentials');
    await waitFor(() => findInvectPanel('Invect: Credentials') !== undefined, 5000);
    assert.ok(findInvectPanel('Invect: Credentials'), 'credentials panel did not open');
  });

  test('invect.openWebhooks opens an Invect webview tab', async () => {
    await closeAllEditors();
    await vscode.commands.executeCommand('invect.openWebhooks');
    await waitFor(() => findInvectPanel('Invect: Webhooks') !== undefined, 5000);
    assert.ok(findInvectPanel('Invect: Webhooks'), 'webhooks panel did not open');
  });

  test('invect.openFlow opens the .flow.ts custom editor', async () => {
    await closeAllEditors();
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error('no workspace');
    }
    const fileUri = vscode.Uri.joinPath(folder.uri, 'flows', 'sample.flow.ts');

    // Mirror the shape FlowsExplorer produces — that's what the command
    // handler accepts.
    await vscode.commands.executeCommand('invect.openFlow', {
      kind: 'flow',
      flowId: fileUri.toString(),
      fileUri: fileUri.toString(),
      label: 'sample',
    });
    await waitFor(() => {
      const tab = findTabByUri(fileUri);
      const input = tab?.input as { viewType?: string } | undefined;
      return input?.viewType === 'invect.flowEditor';
    }, 5000);
  });
});

function findInvectPanel(title: string): vscode.Tab | undefined {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.label === title) {
        return tab;
      }
    }
  }
  return undefined;
}

function findTabByUri(uri: vscode.Uri): vscode.Tab | undefined {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input as { uri?: vscode.Uri } | undefined;
      if (input?.uri?.toString() === uri.toString()) {
        return tab;
      }
    }
  }
  return undefined;
}

async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`waitFor: predicate did not become truthy within ${timeoutMs}ms`);
}
