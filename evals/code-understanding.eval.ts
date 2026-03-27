/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

describe('Code Understanding', () => {
  /**
   * When asked to explain code, the agent should read the file but not
   * modify it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read but not edit when asked to explain code',
    prompt: 'Explain how the authentication middleware works in auth.js',
    files: {
      'auth.js': `
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

function verifyToken(token) {
  // Simple token verification
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

module.exports = { authMiddleware };
`,
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

      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(
        editCalls.length,
        'Agent should not edit when asked to explain',
      ).toBe(0);
    },
  });

  /**
   * When asked to find where a function is used, the agent should use
   * grep_search to search across files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep to find function usage across files',
    prompt: 'Where is the formatPrice function used in this project?',
    files: {
      'src/utils.js': `
function formatPrice(amount) {
  return '$' + amount.toFixed(2);
}
module.exports = { formatPrice };
`,
      'src/cart.js': `
const { formatPrice } = require('./utils');

function displayCart(items) {
  return items.map(item => ({
    name: item.name,
    price: formatPrice(item.price),
  }));
}
module.exports = { displayCart };
`,
      'src/invoice.js': `
const { formatPrice } = require('./utils');

function generateInvoice(order) {
  return {
    total: formatPrice(order.total),
    items: order.items.length,
  };
}
module.exports = { generateInvoice };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'grep_search',
      );
      expect(
        grepCalls.length,
        'Expected agent to use grep_search to find function usage',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When asked to add a feature that requires understanding existing code,
   * the agent should read relevant files before making changes.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read existing code before adding a feature',
    prompt:
      'Add a subtract function to math.js following the same pattern as add.',
    files: {
      'math.js': `
/**
 * Adds two numbers.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
function add(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('Arguments must be numbers');
  }
  return a + b;
}

module.exports = { add };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should read the file first to understand the pattern
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(
        readCalls.length,
        'Expected agent to read the file first',
      ).toBeGreaterThanOrEqual(1);

      // Should have modified the file
      const content = readFileOrFail(rig, 'math.js');
      expect(content).toContain('subtract');
      // Should follow the same pattern (type checking)
      expect(content).toContain('TypeError');
      // Original function should still exist
      expect(content).toContain('add');
    },
  });

  /**
   * When asked to review code for bugs, the agent should identify real
   * issues without making unnecessary changes.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should identify bugs without making unrequested changes',
    prompt:
      'Review server.js for potential bugs. Do not fix them, just list them.',
    files: {
      'server.js': `
const http = require('http');

const server = http.createServer((req, res) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get('id');

  // Potential SQL injection
  const query = 'SELECT * FROM users WHERE id = ' + userId;

  // Missing error handling
  fetch('http://api.example.com/data')
    .then(r => r.json())
    .then(data => {
      res.writeHead(200);
      res.end(JSON.stringify(data));
    });
});

server.listen(3000);
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(
        editCalls.length,
        'Agent should not edit when asked only to review',
      ).toBe(0);

      // File should be unchanged
      const content = readFileOrFail(rig, 'server.js');
      expect(content).toContain('SELECT * FROM users');
    },
  });

  /**
   * When asked about the structure of a project, the agent should use ls
   * and possibly read key files like package.json.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should explore project structure when asked',
    prompt: 'Give me an overview of this project structure and what it does.',
    files: {
      'package.json':
        '{"name": "todo-api", "version": "1.0.0", "main": "src/index.js", "scripts": {"start": "node src/index.js", "test": "jest"}}',
      'src/index.js': 'const app = require("./app"); app.listen(3000);',
      'src/app.js':
        'const express = require("express"); const app = express(); module.exports = app;',
      'src/routes/todos.js':
        'const router = require("express").Router(); module.exports = router;',
      'test/todos.test.js':
        'describe("todos", () => { test("works", () => {}); });',
      'README.md': '# Todo API\nA REST API for managing todos.',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const discoveryCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'list_directory' ||
          log.toolRequest.name === 'glob' ||
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      expect(
        discoveryCalls.length,
        'Expected agent to explore the project structure',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
