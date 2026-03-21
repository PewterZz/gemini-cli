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
   * When asked to fix a logic bug, the agent should fix the specific issue
   * without rewriting unrelated code.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should fix an off-by-one error',
    prompt: 'The pagination in list.js skips the first item. Fix it.',
    files: {
      'list.js': `
function paginate(items, page, perPage) {
  const start = page * perPage;
  const end = start + perPage;
  return items.slice(start, end);
}

// Page 1 should show items 0-9, but it shows items 10-19
module.exports = { paginate };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('list.js');
      // The fix should adjust the start calculation
      // Common fix: (page - 1) * perPage
      expect(content).toMatch(/page\s*-\s*1|page\s*<|start\s*=\s*\(/);
      expect(content).toContain('paginate');
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
