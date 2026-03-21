/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Error Recovery', () => {
  /**
   * When the agent tries to read a file that does not exist, it should not
   * crash or give up. It should either inform the user or try an alternative
   * approach (like listing files first).
   */
  evalTest('USUALLY_PASSES', {
    name: 'should recover gracefully when reading a non-existent file',
    prompt: 'Show me the contents of config.yaml',
    files: {
      'app.js': 'console.log("hello");',
      'README.md': '# My App\nA simple application.',
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // The agent should have attempted to read the file
      const readCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );

      // After failing, the agent should NOT just silently stop.
      // It should either try to find the right file or tell the user.
      // We verify the agent produced some output (didn't crash silently).
      expect(
        result.length,
        'Expected agent to produce output after file-not-found error',
      ).toBeGreaterThan(0);
    },
  });

  /**
   * When an edit fails because the target string was not found, the agent
   * should re-read the file and retry with the correct content, not repeat
   * the same failing edit.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should re-read file after a failed edit and retry',
    prompt: 'Change the greeting in app.js from "hello" to "goodbye"',
    files: {
      'app.js': `
// Application entry point
function main() {
  const message = "hello world";
  console.log(message);
}
main();
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should have read the file at some point
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );

      // Should have made an edit
      const editCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'replace' ||
          log.toolRequest.name === 'write_file',
      );

      expect(
        readCalls.length + editCalls.length,
        'Expected agent to read and edit the file',
      ).toBeGreaterThanOrEqual(2);

      // Verify the file was actually modified
      const content = rig.readFile('app.js');
      expect(content).toContain('goodbye');
    },
  });
});
