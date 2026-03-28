/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';

describe('Edge Cases', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should not attempt to read binary files as text',
    prompt: 'List all the source files in this project, excluding binaries.',
    files: {
      'src/app.js': 'console.log("hello");',
      'src/utils.js': 'module.exports = {};',
      'assets/logo.png': 'PNG BINARY DATA',
      'package.json': '{"name": "app"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      // The real assertion: agent should NOT have attempted to read
      // assets/logo.png as a text file
      const pngReadCalls = toolLogs.filter((log) => {
        if (
          log.toolRequest.name !== 'read_file' &&
          log.toolRequest.name !== 'read_many_files'
        ) {
          return false;
        }

        let args = log.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            return args.includes('logo.png');
          }
        }

        return JSON.stringify(args).includes('logo.png');
      });
      expect(
        pngReadCalls.length,
        'Agent should not attempt to read binary PNG file as text',
      ).toBe(0);
    },
  });
  evalTest('USUALLY_PASSES', {
    name: 'should not read all files in a large project',
    prompt: 'Find where the database connection is configured.',
    files: Object.fromEntries([
      ...Array.from({ length: 20 }, (_, i) => [
        `src/module${i}.js`,
        `module.exports = { id: ${i} };`,
      ]),
      [
        'src/db.js',
        'const pool = new Pool({ connectionString: process.env.DATABASE_URL }); module.exports = pool;',
      ],
      ['package.json', '{"name": "big-app"}'],
    ]),
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should use grep or strategic reading, not read all 20+ files
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'grep_search',
      );

      if (grepCalls.length === 0) {
        // If no grep, should not have read more than half the files
        expect(
          readCalls.length,
          'Should use grep or read selectively, not every file',
        ).toBeLessThan(15);
      }
    },
  });
  evalTest('USUALLY_PASSES', {
    name: 'should handle ambiguous prompts reasonably',
    prompt: 'Fix it.',
    files: {
      'app.js': `
function greet(name) {
  return 'Hello, ' + name + '!';
}

// This function has a bug
function divide(a, b) {
  return a / b; // no zero check
}

module.exports = { greet, divide };
`,
    },
    assert: async (rig) => {
      // Agent should either ask for clarification or make a reasonable
      // attempt at identifying and fixing the most obvious issue
      const toolLogs = rig.readToolLogs();
      const totalCalls = toolLogs.length;

      // Should have done something (read file, ask user, or make a fix)
      expect(totalCalls).toBeGreaterThanOrEqual(1);
    },
  });
  evalTest('USUALLY_PASSES', {
    name: 'should preserve valid JSON when editing JSON files',
    prompt:
      'Add a "description" field to package.json with the text "A todo application".',
    files: {
      'package.json': `{
  "name": "todo-app",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'package.json');
      // Should be valid JSON
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error('package.json is not valid JSON after edit');
      }
      expect(parsed.description).toBe('A todo application');
      // Existing fields should be preserved
      expect(parsed.name).toBe('todo-app');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.scripts.start).toBe('node index.js');
      expect(parsed.dependencies.express).toBe('^4.18.0');
    },
  });
  evalTest('USUALLY_PASSES', {
    name: 'should handle duplicate filenames in different directories',
    prompt: 'Read the config.js file.',
    files: {
      'config.js': '// Root config\nmodule.exports = { env: "production" };',
      'src/config.js': '// Src config\nmodule.exports = { port: 3000 };',
      'test/config.js': '// Test config\nmodule.exports = { timeout: 5000 };',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      // Agent should read at least one config.js
      const readCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);
    },
  });
});
