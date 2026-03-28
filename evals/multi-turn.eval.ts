/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('Multi-Turn Context', () => {
  /**
   * When asked to build on a previous change, the agent should read
   * the current state of the file, not assume the original content.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should read current file state before making follow-up changes',
    prompt: 'Add an age-validation function to validators.ts and export it.',
    files: {
      'validators.ts': `
export function validateName(name: string): boolean {
  return name.trim().length > 1;
}

export const version = '1.0.0';
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Must read the file first to see what's already there
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(
        readCalls.length,
        'Expected agent to read file before adding to it',
      ).toBeGreaterThanOrEqual(1);

      const contentAfterFirstTurn = readFileOrFail(rig, 'validators.ts');
      const ageFunctionMatch =
        contentAfterFirstTurn.match(
          /export\s+function\s+([A-Za-z_$][\w$]*[Aa]ge[\w$]*)\s*\(/,
        ) ||
        contentAfterFirstTurn.match(
          /function\s+([A-Za-z_$][\w$]*[Aa]ge[\w$]*)\s*\(/,
        ) ||
        contentAfterFirstTurn.match(
          /export\s+const\s+([A-Za-z_$][\w$]*[Aa]ge[\w$]*)\s*=/,
        ) ||
        contentAfterFirstTurn.match(
          /const\s+([A-Za-z_$][\w$]*[Aa]ge[\w$]*)\s*=/,
        );
      expect(
        ageFunctionMatch,
        'Expected first turn to add an age-related validator function',
      ).toBeTruthy();
      const ageFunctionName = ageFunctionMatch![1];

      const toolLogCountBeforeFollowUp = toolLogs.length;
      const followUpResult = await rig.run({
        args: 'Follow-up: update the function you just added so non-number inputs return false. Then respond with FUNCTION=<name> using the exact function name you updated.',
      });

      const followUpToolLogs = rig
        .readToolLogs()
        .slice(toolLogCountBeforeFollowUp)
        .filter(
          (log) =>
            log.toolRequest.name === 'read_file' ||
            log.toolRequest.name === 'read_many_files',
        );
      expect(
        followUpToolLogs.length,
        'Expected the follow-up turn to re-read current file state',
      ).toBeGreaterThanOrEqual(1);

      expect(followUpResult).toMatch(
        new RegExp(`FUNCTION\\s*=\\s*${escapeRegExp(ageFunctionName)}`),
      );
    },
  });

  /**
   * When given an ambiguous follow-up request, the agent should infer
   * context from the existing file state.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should infer context from existing work when handling follow-up',
    prompt:
      'Add the same validation to updateUser as createUser has, and for invalid email throw exactly: E_USER_EMAIL_INVALID.',
    files: {
      'users.ts': `
export function createUser(name: string, email: string) {
  if (!name || name.trim() === '') throw new Error('Name is required');
  if (!email || !email.includes('@')) throw new Error('Valid email is required');
  return { name, email, createdAt: new Date() };
}

export function updateUser(id: number, name: string, email: string) {
  // TODO: add validation similar to createUser
  return { id, name, email, updatedAt: new Date() };
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Must read the file to understand existing validation pattern
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);

      // updateUser should now have validation
      const content = readFileOrFail(rig, 'users.ts');
      expect(content).toMatch(/throw|Error|required|valid/i);
      expect(content).toContain('E_USER_EMAIL_INVALID');
      // createUser should be unchanged
      expect(content).toContain('Name is required');

      const followUpResult = await rig.run({
        args: 'Follow-up: what exact invalid-email error code did you use in the previous step for updateUser? Reply in the form CODE=<value>.',
      });
      expect(followUpResult).toMatch(/CODE\s*=\s*E_USER_EMAIL_INVALID/);
    },
  });

  /**
   * When asked to undo or revert a change, the agent should know
   * what the original state was.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should revert to original code when asked to undo a change',
    prompt:
      'In config.ts, make two changes in order: first read port from process.env.PORT with fallback 3000, then increase requestTimeoutMs to 10000.',
    files: {
      'config.ts': `
export const port = 3000;
export const requestTimeoutMs = 5000;
export const enableMetrics = false;
`,
    },
    assert: async (rig) => {
      const toolLogsAfterFirstTurn = rig.readToolLogs();

      // Must edit the file
      const editCalls = toolLogsAfterFirstTurn.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(editCalls.length).toBeGreaterThanOrEqual(1);

      const contentAfterFirstTurn = readFileOrFail(rig, 'config.ts');
      expect(contentAfterFirstTurn).toMatch(/process\.env\.PORT/);
      expect(contentAfterFirstTurn).toContain('requestTimeoutMs');
      expect(contentAfterFirstTurn).toContain('10000');

      await rig.run({ args: 'Undo the LAST change only.' });

      const contentAfterUndo = readFileOrFail(rig, 'config.ts');
      expect(contentAfterUndo).toMatch(/process\.env\.PORT/);
      expect(contentAfterUndo).toContain('3000');
      expect(contentAfterUndo).toContain('requestTimeoutMs = 5000');
      expect(contentAfterUndo).toContain('enableMetrics = false');
      expect(contentAfterUndo).not.toContain('requestTimeoutMs = 10000');
    },
  });

  /**
   * When the previous attempt at a task left partial work, the agent
   * should complete it rather than starting over.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should complete partial work rather than restarting from scratch',
    prompt:
      'The previous session started adding error handling to fetchUser but did not finish. Please complete the error handling.',
    files: {
      'api.ts': `
export async function fetchUser(id: number) {
  try {
    const response = await fetch(\`/api/users/\${id}\`);
    // TODO: handle non-ok response
    const data = await response.json();
    return data;
  } catch (error) {
    // TODO: handle network errors
  }
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(editCalls.length).toBeGreaterThanOrEqual(1);

      const content = readFileOrFail(rig, 'api.ts');
      // Should handle non-ok response (complete the first TODO)
      expect(content).toMatch(/ok|status|throw|Error/);
      // try/catch should still be there
      expect(content).toContain('catch');
    },
  });
});
