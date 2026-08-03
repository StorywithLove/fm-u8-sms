import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Windows scheduled task uses the hidden background runner', async () => {
  const installer = await readFile(
    new URL('../scripts/install-autostart.ps1', import.meta.url),
    'utf8',
  );
  const runner = await readFile(
    new URL('../scripts/run-hidden.ps1', import.meta.url),
    'utf8',
  );

  assert.match(installer, /-WindowStyle Hidden/);
  assert.match(installer, /run-hidden\.ps1/);
  assert.doesNotMatch(installer, /New-ScheduledTaskAction\s+`\s*\r?\n\s*-Execute \$nodePath/);
  assert.match(runner, /& \$NodePath/);
  assert.match(runner, /exit \$LASTEXITCODE/);
});
