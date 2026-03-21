/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

describe('Documentation', () => {
  /**
   * When asked to add JSDoc comments, the agent should add documentation
   * without changing the code logic.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add JSDoc comments without changing logic',
    prompt: 'Add JSDoc comments to all functions in api.js',
    files: {
      'api.js': `
function createUser(name, email, age) {
  return { id: Date.now(), name, email, age, createdAt: new Date() };
}

function findUser(users, id) {
  return users.find(u => u.id === id);
}

function updateUser(users, id, updates) {
  const user = findUser(users, id);
  if (!user) return null;
  return { ...user, ...updates, updatedAt: new Date() };
}

module.exports = { createUser, findUser, updateUser };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('api.js');
      // Should have JSDoc comments
      expect(content).toMatch(/\/\*\*/);
      expect(content).toMatch(/@param/);
      expect(content).toMatch(/@returns/);
      // All functions should still exist
      expect(content).toContain('createUser');
      expect(content).toContain('findUser');
      expect(content).toContain('updateUser');
    },
  });

  /**
   * When asked to write a README, the agent should create one that
   * describes the project based on the code.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should generate README based on project contents',
    prompt: 'Write a README.md for this project.',
    files: {
      'package.json':
        '{"name": "url-shortener", "version": "1.0.0", "description": "A URL shortening service", "scripts": {"start": "node index.js", "test": "jest"}}',
      'index.js': `
const express = require('express');
const app = express();
app.post('/shorten', (req, res) => res.json({ short: 'abc123' }));
app.get('/:code', (req, res) => res.redirect('https://example.com'));
app.listen(3000);
`,
    },
    assert: async (rig) => {
      const readme = rig.readFile('README.md');
      expect(readme).toBeDefined();
      // Should reference the project name
      expect(readme).toMatch(/url.shortener/i);
      // Should include setup or usage instructions
      expect(readme).toMatch(/install|setup|usage|start|run/i);
    },
  });

  /**
   * When asked to update documentation, the agent should read the existing
   * docs first and modify them rather than rewriting from scratch.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should update existing documentation preserving structure',
    prompt: 'Update the README to include the new /health endpoint.',
    files: {
      'README.md': `# My API

## Endpoints

### POST /users
Creates a new user.

### GET /users/:id
Returns a user by ID.

## Setup
Run \`npm start\` to start the server.
`,
      'server.js': `
app.get('/health', (req, res) => res.json({ status: 'ok' }));
`,
    },
    assert: async (rig) => {
      const readme = rig.readFile('README.md');
      // Should include the new endpoint
      expect(readme).toMatch(/health/i);
      // Should preserve existing content
      expect(readme).toContain('POST /users');
      expect(readme).toContain('GET /users/:id');
      expect(readme).toContain('Setup');
    },
  });

  /**
   * When asked to explain a complex function, the agent should NOT
   * modify the code.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should explain code without modifying it',
    prompt: 'Explain what the memoize function does and how it works.',
    files: {
      'utils.js': `
function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

module.exports = { memoize };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(editCalls.length, 'Should not edit when asked to explain').toBe(0);

      // File should be unchanged
      const content = rig.readFile('utils.js');
      expect(content).toContain('memoize');
      expect(content).toContain('cache');
    },
  });
});
