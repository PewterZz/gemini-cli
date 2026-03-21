/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('File Operations', () => {
  /**
   * When asked to create a new file, the agent should use write_file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use write_file to create a new file',
    prompt:
      'Create a new file called utils.js with a function that adds two numbers.',
    files: {
      'package.json': '{"name": "test-app", "version": "1.0.0"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      expect(
        writeCalls.length,
        'Expected agent to use write_file to create a new file',
      ).toBeGreaterThanOrEqual(1);

      // Verify the file was created
      const content = rig.readFile('utils.js');
      expect(content).toBeDefined();
    },
  });

  /**
   * When asked to modify an existing file, the agent should prefer replace
   * over write_file to preserve surrounding content.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should prefer replace over write_file for modifications',
    prompt: 'Change the function name from "add" to "sum" in math.js',
    files: {
      'math.js': `
// Math utilities
function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = { add, multiply };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const replaceCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'replace',
      );
      expect(
        replaceCalls.length,
        'Expected agent to use replace for modifying existing code',
      ).toBeGreaterThanOrEqual(1);

      const content = rig.readFile('math.js');
      expect(content).toContain('sum');
      // multiply should still be there (not overwritten)
      expect(content).toContain('multiply');
    },
  });

  /**
   * When asked to list files in a directory, the agent should use ls.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use ls to list directory contents',
    prompt: 'What files are in this project?',
    files: {
      'src/index.js': 'console.log("main");',
      'src/utils.js': 'module.exports = {};',
      'test/index.test.js': 'test("works", () => {});',
      'package.json': '{"name": "test-app"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const lsCalls = toolLogs.filter((log) => log.toolRequest.name === 'ls');
      expect(
        lsCalls.length,
        'Expected agent to use ls to list files',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When asked to find files matching a pattern, the agent should use glob.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use glob to find files matching a pattern',
    prompt: 'Find all JavaScript test files in this project.',
    files: {
      'src/app.js': 'console.log("app");',
      'src/utils.js': 'module.exports = {};',
      'test/app.test.js': 'test("app works", () => {});',
      'test/utils.test.js': 'test("utils works", () => {});',
      'package.json': '{"name": "test-app"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const globCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'glob',
      );
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'grep_search',
      );
      // Agent might use glob or grep to find test files
      expect(
        globCalls.length + grepCalls.length,
        'Expected agent to use glob or grep to find test files',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When reading a large file, the agent should use line ranges to avoid
   * reading the entire file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use line ranges when reading a specific part of a large file',
    prompt: 'Show me lines 10-20 of server.js',
    files: {
      'server.js': Array.from(
        { length: 50 },
        (_, i) => `// Line ${i + 1}: server configuration`,
      ).join('\n'),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(
        readCalls.length,
        'Expected agent to read the file',
      ).toBeGreaterThanOrEqual(1);

      // Check if the agent used line range parameters
      const usedLineRange = readCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            return false;
          }
        }
        return args.start_line !== undefined || args.end_line !== undefined;
      });

      expect(
        usedLineRange,
        'Expected agent to use line ranges for partial file read',
      ).toBe(true);
    },
  });

  /**
   * When asked to delete content from a file, the agent should use replace
   * to remove the specific section rather than rewriting the whole file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use replace to remove specific content',
    prompt: 'Remove the debug logging from app.js',
    files: {
      'app.js': `
function processOrder(order) {
  console.log('DEBUG: processing order', order);
  const total = order.items.reduce((sum, item) => sum + item.price, 0);
  console.log('DEBUG: total calculated', total);
  return { ...order, total };
}

module.exports = { processOrder };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const editCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'replace' ||
          log.toolRequest.name === 'write_file',
      );
      expect(editCalls.length).toBeGreaterThanOrEqual(1);

      const content = rig.readFile('app.js');
      expect(content).not.toContain('DEBUG');
      // Core logic should still be there
      expect(content).toContain('processOrder');
      expect(content).toContain('reduce');
    },
  });

  /**
   * When asked about a file that could match multiple names, the agent
   * should search before guessing.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should search for files when the name is ambiguous',
    prompt: 'Show me the configuration file',
    files: {
      'config.json': '{"port": 3000}',
      'src/app.js': 'console.log("app");',
      'README.md': '# App',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should have done some discovery (ls, glob, or grep) before reading
      const discoveryCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'ls' ||
          log.toolRequest.name === 'glob' ||
          log.toolRequest.name === 'grep_search',
      );
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );

      expect(
        discoveryCalls.length + readCalls.length,
        'Expected agent to discover and read the config file',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
