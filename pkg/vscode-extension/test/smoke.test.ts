import * as assert from 'node:assert';
import * as vscode from 'vscode';

/**
 * Boots the extension host inside a real VSCode instance, runs the
 * `invect.hello` command, and asserts that the notification API was
 * called with the expected message.
 *
 * Driven by `@vscode/test-cli` (see `.vscode-test.mjs`).
 */
suite('Invect extension — smoke', () => {
  test('activate + invect.hello', async () => {
    // Activate the extension by ID. `package.json` registers `invect.hello`,
    // so the command must be present once activation completes.
    // VSCode derives the extension ID from `<publisher>.<name without scope>`
    // — the package name is `@invect/vscode` so the ID is `invect.vscode`.
    // Searching by candidate IDs makes the test resilient to publisher / name
    // tweaks during local iteration.
    // VSCode keeps the package's npm scope in the extension ID, so the ID is
    // literally `<publisher>.<package.name>` — e.g. `invect.@invect/vscode`.
    const candidateIds = ['invect.@invect/vscode', 'invect.vscode'];
    let ext: vscode.Extension<unknown> | undefined;
    for (const id of candidateIds) {
      ext = vscode.extensions.getExtension(id);
      if (ext) {
        break;
      }
    }
    if (!ext) {
      const found = vscode.extensions.all
        .filter((e) => !e.id.startsWith('vscode.'))
        .map((e) => e.id);
      throw new Error(
        `extension not found by id ${candidateIds.join(' or ')}. Loaded non-builtin extensions: ${JSON.stringify(found)}`,
      );
    }
    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('invect.hello'), 'invect.hello command not registered');

    // Stub showInformationMessage so the test asserts behavior without
    // requiring a real notification dismiss.
    const seen: string[] = [];
    const original = vscode.window.showInformationMessage;
    (
      vscode.window as unknown as {
        showInformationMessage: typeof vscode.window.showInformationMessage;
      }
    ).showInformationMessage = (async (message: string) => {
      seen.push(message);
      return undefined;
    }) as typeof vscode.window.showInformationMessage;

    try {
      await vscode.commands.executeCommand('invect.hello');
    } finally {
      (
        vscode.window as unknown as {
          showInformationMessage: typeof vscode.window.showInformationMessage;
        }
      ).showInformationMessage = original;
    }

    assert.deepStrictEqual(seen, ['Hello from Invect']);
  });
});
