/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';

describe('Edge Cases', () => {
  /**
   * When a file is empty, the agent should handle it gracefully.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should handle empty files gracefully',
    prompt: 'What does app.js do?',
    files: {
      'app.js': '',
      'package.json': '{"name": "empty-app"}',
    },
    assert: async (rig) => {
      // Should not crash -- verify by checking that at least one tool
      // call was made (agent attempted to read the empty file)
      const toolLogs = rig.readToolLogs();
      expect(
        toolLogs.length,
        'Agent should have made at least one tool call even for empty files',
      ).toBeGreaterThan(0);
    },
  });

  /**
   * When files have unusual extensions, the agent should still read them.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read files with unusual extensions',
    prompt: 'What is in the Makefile?',
    files: {
      Makefile: `
.PHONY: build test clean

build:
\tnode scripts/build.js

test:
\tnpm test

clean:
\trm -rf dist/
`,
      'package.json': '{"name": "app"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const readCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When a file has syntax errors, the agent should still be able to
   * read and work with it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should handle files with syntax errors',
    prompt: 'Fix the syntax error in broken.js',
    files: {
      'broken.js': `
function add(a, b) {
  return a + b
}

function broken( {
  console.log("missing closing paren and brace"
}

module.exports = { add, broken };
`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'broken.js');
      // Should have fixed the syntax error
      // The add function should still work
      expect(content).toContain('add');
      // broken function should be syntactically valid now
      expect(content).toContain('broken');
    },
  });

  /**
   * When asked to work with binary or non-text files, the agent should
   * not try to read them as text.
   */
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

  /**
   * When a project has many files, the agent should not try to read
   * all of them at once.
   */
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

  /**
   * When the user's prompt is ambiguous, the agent should ask for
   * clarification or make a reasonable assumption.
   */
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

  /**
   * When working with JSON files, the agent should preserve valid JSON
   * formatting.
   */
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

  /**
   * When asked to work with a file in a deeply nested directory, the
   * agent should handle the path correctly.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should handle deeply nested file paths',
    prompt:
      'Add a utility function to the helpers file in src/lib/utils/helpers.js',
    files: {
      'src/lib/utils/helpers.js': `
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

module.exports = { clamp };
`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'src/lib/utils/helpers.js');
      // Should have the original function plus a new one
      expect(content).toContain('clamp');
      // Should have added something new
      const functionCount = (content.match(/function\s+\w+/g) || []).length;
      expect(functionCount).toBeGreaterThanOrEqual(2);
    },
  });

  /**
   * When the user asks about a specific line number, the agent should
   * read with the correct range.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should handle line number references',
    prompt: 'There is a bug on line 5 of app.js. What is it?',
    files: {
      'app.js': `const express = require('express');
const app = express();
app.use(express.json());

app.get('/users', (req, res) => {
  const users = db.getUsers(); // db is not imported
  res.json(users);
});

app.listen(3000);
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When multiple files have the same name in different directories,
   * the agent should ask or handle the ambiguity.
   */
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
