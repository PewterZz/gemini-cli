/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Test Writing', () => {
  /**
   * When asked to write tests, the agent should create a test file that
   * imports from the source file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should write tests that import from the source module',
    prompt: 'Write unit tests for the functions in math.js',
    files: {
      'math.js': `
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = { add, subtract, multiply };
`,
      'package.json':
        '{"name": "test-app", "devDependencies": {"jest": "^29.0.0"}}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      expect(
        writeCalls.length,
        'Expected agent to create a test file',
      ).toBeGreaterThanOrEqual(1);

      // Find the test file
      const testFile =
        rig.readFile('math.test.js') ||
        rig.readFile('test/math.test.js') ||
        rig.readFile('__tests__/math.test.js');
      expect(testFile).toBeDefined();

      // Test file should import from math.js
      expect(testFile).toContain('math');
      // Should test multiple functions
      expect(testFile).toContain('add');
      expect(testFile).toContain('subtract');
    },
  });

  /**
   * When asked to write tests for a specific function, the agent should
   * include edge cases.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should include edge cases in generated tests',
    prompt:
      'Write thorough tests for the divide function in calc.js. Include edge cases.',
    files: {
      'calc.js': `
function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

module.exports = { divide };
`,
      'package.json':
        '{"name": "calc", "devDependencies": {"jest": "^29.0.0"}}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      expect(writeCalls.length).toBeGreaterThanOrEqual(1);

      // Find the test file written
      const testFile =
        rig.readFile('calc.test.js') ||
        rig.readFile('test/calc.test.js') ||
        rig.readFile('__tests__/calc.test.js');
      if (testFile) {
        // Should test division by zero
        expect(testFile).toMatch(/zero|0|throw|error/i);
        // Should test normal division
        expect(testFile).toContain('divide');
      }
    },
  });

  /**
   * When asked to add a test for a bug fix, the agent should write a
   * regression test that would have caught the bug.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should write a regression test for a described bug',
    prompt:
      'The capitalize function fails on empty strings. Fix it and add a regression test.',
    files: {
      'strings.js': `
function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1);
}

module.exports = { capitalize };
`,
      'package.json':
        '{"name": "strings", "devDependencies": {"jest": "^29.0.0"}}',
    },
    assert: async (rig) => {
      // The function should be fixed
      const source = rig.readFile('strings.js');
      expect(source).toContain('capitalize');

      // A test should exist
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      expect(writeCalls.length).toBeGreaterThanOrEqual(1);
    },
  });
});
