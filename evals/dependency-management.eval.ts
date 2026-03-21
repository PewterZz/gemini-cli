/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Dependency Management', () => {
  /**
   * When asked to install a package, the agent should use the project's
   * package manager (npm/yarn/pnpm based on lockfile).
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use npm when package-lock.json exists',
    prompt: 'Install the express package.',
    files: {
      'package.json': '{"name": "test-app", "version": "1.0.0"}',
      'package-lock.json': '{"lockfileVersion": 3}',
      'index.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      const installCall = shellCalls.find((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const cmd = typeof args === 'string' ? args : args?.command || '';
        return cmd.includes('install') && cmd.includes('express');
      });

      expect(
        installCall,
        'Expected agent to run an install command',
      ).toBeDefined();

      // Should use npm, not yarn or pnpm
      let args = installCall.toolRequest.args;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          /* */
        }
      }
      const cmd = typeof args === 'string' ? args : args?.command || '';
      expect(cmd).toContain('npm');
    },
  });

  /**
   * When asked about outdated dependencies, the agent should check
   * package.json rather than guessing.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read package.json when asked about dependencies',
    prompt: 'What dependencies does this project use?',
    files: {
      'package.json':
        '{"name": "my-app", "dependencies": {"express": "^4.18.0", "lodash": "^4.17.21"}, "devDependencies": {"jest": "^29.0.0"}}',
      'index.js': 'const express = require("express");',
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
        'Expected agent to read package.json',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When asked to add a script to package.json, the agent should preserve
   * existing scripts.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should preserve existing scripts when adding a new one',
    prompt: 'Add a "lint" script that runs "eslint ." to package.json',
    files: {
      'package.json': `{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js",
    "test": "jest"
  }
}`,
      'index.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const pkg = rig.readFile('package.json');
      const parsed = JSON.parse(pkg);
      expect(parsed.scripts.lint).toContain('eslint');
      // Existing scripts should be preserved
      expect(parsed.scripts.start).toBe('node index.js');
      expect(parsed.scripts.test).toBe('jest');
    },
  });
});
