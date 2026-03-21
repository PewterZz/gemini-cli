/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Git Operations', () => {
  /**
   * When asked to check the git status, the agent should use shell with
   * appropriate git commands.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use git status when asked about uncommitted changes',
    prompt: 'Are there any uncommitted changes in this repo?',
    files: {
      '.git/HEAD': 'ref: refs/heads/main',
      '.git/config': '[core]\n\trepositoryformatversion = 0',
      'app.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      const gitCall = shellCalls.find((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const cmd = typeof args === 'string' ? args : args?.command || '';
        return cmd.includes('git');
      });

      expect(gitCall, 'Expected agent to use a git command').toBeDefined();
    },
  });

  /**
   * When asked to create a commit message, the agent should look at the
   * actual changes before writing a message.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should check diff before writing commit message',
    prompt:
      'Write a good commit message for the current changes and commit them.',
    files: {
      '.git/HEAD': 'ref: refs/heads/main',
      '.git/config': '[core]\n\trepositoryformatversion = 0',
      'app.js': 'console.log("updated");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      // Should have run git diff or git status before committing
      const commands = shellCalls.map((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        return typeof args === 'string' ? args : args?.command || '';
      });

      const hasInspection = commands.some(
        (cmd) => cmd.includes('git diff') || cmd.includes('git status'),
      );
      expect(
        hasInspection,
        'Expected agent to inspect changes before committing',
      ).toBe(true);
    },
  });

  /**
   * When asked to create a branch, the agent should use a descriptive name.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should create a descriptively named branch',
    prompt: 'Create a new branch for adding user authentication.',
    files: {
      '.git/HEAD': 'ref: refs/heads/main',
      '.git/config': '[core]\n\trepositoryformatversion = 0',
      'app.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      const branchCall = shellCalls.find((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const cmd = typeof args === 'string' ? args : args?.command || '';
        return (
          cmd.includes('git checkout -b') ||
          cmd.includes('git branch') ||
          cmd.includes('git switch -c')
        );
      });

      expect(branchCall, 'Expected agent to create a branch').toBeDefined();

      // The branch name should be descriptive (contain auth-related words)
      let args = branchCall.toolRequest.args;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          /* */
        }
      }
      const cmd = typeof args === 'string' ? args : args?.command || '';
      expect(cmd).toMatch(/auth|user|login/i);
    },
  });
});
