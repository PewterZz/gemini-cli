/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Debugging', () => {
  /**
   * When asked to debug a runtime error, the agent should read the
   * relevant file and identify the issue.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should identify a null reference error',
    prompt:
      'This code throws "Cannot read properties of undefined". Find and fix the bug in app.js.',
    files: {
      'app.js': `
function getUserName(user) {
  return user.profile.name;
}

function processUsers(users) {
  return users.map(u => getUserName(u));
}

// Some users might not have a profile
const users = [
  { id: 1, profile: { name: 'Alice' } },
  { id: 2 },
  { id: 3, profile: { name: 'Charlie' } },
];

module.exports = { processUsers, users };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('app.js');
      // Should add null checking for user.profile
      expect(content).toMatch(/profile\s*\?\.|\bif\b.*profile|profile\s*&&/);
    },
  });

  /**
   * When tests fail due to a bug in a dependency module, the agent should
   * trace the error to the correct file and fix the root cause, not the
   * calling code.
   *
   * This tests cross-module debugging: the failing test is in calculator.ts,
   * the bug is in math.ts. The agent must trace the failure back to the root.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should trace a test failure to the correct dependency module',
    timeout: 600000,
    files: {
      'src/math.ts': `
export function add(a: number, b: number): number {
  return a - b; // BUG: should be addition
}
`,
      'src/calculator.ts': `
import { add } from './math.js';

export function calculateTotal(a: number, b: number): number {
  return add(a, b);
}
`,
      'src/calculator.test.ts': `
import { expect, test } from 'vitest';
import { calculateTotal } from './calculator.js';

test('correctly adds two numbers', () => {
  expect(calculateTotal(2, 3)).toBe(5);
});
`,
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^2.0.0' },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'node',
          strict: true,
          skipLibCheck: true,
        },
      }),
    },
    prompt:
      'The tests in this project are failing. Diagnose the issue, fix the bug, and ensure all tests pass.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent must have run the tests to observe the failure
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const ranTests = shellCalls.some((log) => {
        let args = log.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const cmd =
          typeof args === 'string'
            ? args
            : ((args as Record<string, string>).command ?? '');
        return (
          cmd.includes('vitest') ||
          cmd.includes('npm test') ||
          cmd.includes('npm run test')
        );
      });
      expect(ranTests, 'Expected agent to run the test suite').toBe(true);

      // The fix must be in math.ts (the root cause), not calculator.ts
      const mathContent = rig.readFile('src/math.ts');
      expect(
        mathContent,
        'Expected math.ts to use addition (a + b), not subtraction',
      ).toContain('a + b');
    },
  });

  /**
   * When asked about a failing test, the agent should read both the test
   * and the source code.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read both test and source when debugging test failures',
    prompt: 'The test in math.test.js is failing. Figure out why and fix it.',
    files: {
      'math.js': `
function average(numbers) {
  const sum = numbers.reduce((a, b) => a + b, 0);
  return sum / numbers.length;
}
module.exports = { average };
`,
      'math.test.js': `
const { average } = require('./math');

test('average of empty array', () => {
  expect(average([])).toBe(0);
});

test('average of [1,2,3]', () => {
  expect(average([1, 2, 3])).toBe(2);
});
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should read both files
      const readCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);

      // Should fix the empty array case (returns NaN because 0/0)
      const source = rig.readFile('math.js');
      expect(source).toMatch(/length\s*===?\s*0|\.length\s*<|!numbers\.length/);
    },
  });

  /**
   * When asked to add error handling, the agent should wrap the right
   * sections in try/catch without over-catching.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add targeted error handling',
    prompt:
      'Add error handling to the fetchData function in api.js. It should return null on failure.',
    files: {
      'api.js': `
async function fetchData(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

async function fetchMultiple(urls) {
  const results = [];
  for (const url of urls) {
    results.push(await fetchData(url));
  }
  return results;
}

module.exports = { fetchData, fetchMultiple };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('api.js');
      expect(content).toContain('try');
      expect(content).toContain('catch');
      expect(content).toContain('null');
      // fetchMultiple should still exist
      expect(content).toContain('fetchMultiple');
    },
  });

  /**
   * When the user provides an error message, the agent should search for
   * the relevant code that could cause it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should search for code related to an error message',
    prompt:
      'I\'m getting "EADDRINUSE: address already in use :::3000" when starting my app. Help me fix it.',
    files: {
      'server.js': `
const http = require('http');
const app = require('./app');

const PORT = 3000;

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
`,
      'app.js': `
const handlers = {
  '/': (req, res) => res.end('Hello'),
  '/health': (req, res) => res.end('OK'),
};

module.exports = (req, res) => {
  const handler = handlers[req.url] || ((req, res) => {
    res.statusCode = 404;
    res.end('Not Found');
  });
  handler(req, res);
};
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should have searched or read files to find port usage
      const discoveryCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      expect(
        discoveryCalls.length,
        'Expected agent to search for port-related code',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
