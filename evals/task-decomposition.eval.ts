/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Task Decomposition', () => {
  /**
   * When given a complex multi-step task, the agent should complete all
   * steps rather than stopping after the first one.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should complete all steps of a multi-step task',
    prompt:
      'Create a utils.js with a formatName function, write a test for it, and add a test script to package.json.',
    files: {
      'package.json':
        '{"name": "app", "version": "1.0.0", "scripts": {"start": "node index.js"}}',
      'index.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      // Step 1: utils.js should exist with formatName
      const utils = rig.readFile('utils.js') || rig.readFile('src/utils.js');
      expect(utils).toBeDefined();
      expect(utils).toContain('formatName');

      // Step 2: test file should exist
      const testFile =
        rig.readFile('utils.test.js') ||
        rig.readFile('test/utils.test.js') ||
        rig.readFile('__tests__/utils.test.js');
      expect(testFile).toBeDefined();

      // Step 3: package.json should have test script
      const pkg = JSON.parse(rig.readFile('package.json'));
      expect(pkg.scripts.test).toBeDefined();
    },
  });

  /**
   * When asked to set up a project from scratch, the agent should create
   * the necessary files and structure.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should scaffold a project with correct structure',
    prompt:
      'Set up a basic Express API project with a health check endpoint, proper folder structure, and a start script.',
    files: {
      'package.json': '{"name": "new-api", "version": "1.0.0"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      // Should create multiple files
      expect(writeCalls.length).toBeGreaterThanOrEqual(2);

      // package.json should have a start script
      const pkg = JSON.parse(rig.readFile('package.json'));
      expect(pkg.scripts?.start).toBeDefined();
    },
  });

  /**
   * When a task requires reading before writing, the agent should read
   * first rather than making assumptions.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read existing code before making changes',
    prompt: 'Add error handling to all the route handlers in routes.js.',
    files: {
      'routes.js': `
const router = require('express').Router();

router.get('/users', async (req, res) => {
  const users = await db.getUsers();
  res.json(users);
});

router.post('/users', async (req, res) => {
  const user = await db.createUser(req.body);
  res.status(201).json(user);
});

router.delete('/users/:id', async (req, res) => {
  await db.deleteUser(req.params.id);
  res.status(204).end();
});

module.exports = router;
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const readCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      expect(
        readCalls.length,
        'Expected agent to read the file before modifying',
      ).toBeGreaterThanOrEqual(1);

      const content = rig.readFile('routes.js');
      expect(content).toContain('try');
      expect(content).toContain('catch');
      // All three routes should still exist
      expect(content).toContain('getUsers');
      expect(content).toContain('createUser');
      expect(content).toContain('deleteUser');
    },
  });

  /**
   * When asked to do something that depends on a missing file, the agent
   * should check for the file first and report the issue.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should check dependencies before acting',
    prompt: 'Run the tests.',
    files: {
      'package.json': '{"name": "app", "scripts": {"test": "jest"}}',
      'src/app.js': 'module.exports = () => "hello";',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      // Should attempt to run tests
      expect(shellCalls.length).toBeGreaterThanOrEqual(1);

      const testRun = shellCalls.find((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const cmd = typeof args === 'string' ? args : args?.command || '';
        return cmd.includes('test') || cmd.includes('jest');
      });
      expect(testRun).toBeDefined();
    },
  });

  /**
   * When asked to implement a feature that spans multiple files, the agent
   * should create all necessary files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should create all necessary files for a feature',
    prompt:
      'Add a user authentication feature with a User model, auth middleware, and login route.',
    files: {
      'package.json': '{"name": "api", "dependencies": {"express": "^4.18.0"}}',
      'app.js': `
const express = require('express');
const app = express();
app.use(express.json());
module.exports = app;
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      // Should create multiple files for the feature
      expect(
        writeCalls.length,
        'Expected agent to create multiple files for auth feature',
      ).toBeGreaterThanOrEqual(2);
    },
  });
});
