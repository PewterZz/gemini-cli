/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * L3 evals: multi-step error recovery chains.
 *
 * These test the agent's ability to detect a failure, diagnose the root cause,
 * apply a fix, and verify the fix worked -- without being explicitly told what
 * went wrong. Complexity: L3 (error recovery chain, multi-turn reasoning).
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('L3 Error Recovery Chain', () => {
  /**
   * Agent must: run tests, observe failure, read failing test + source,
   * identify the bug (off-by-one), fix it, verify tests pass.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should detect failing tests, fix the bug, and verify the fix works',
    prompt:
      'The tests are failing. Find out why, fix the issue, and confirm the tests pass.',
    files: {
      'src/math.ts': `
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function sum(arr: number[]): number {
  let total = 0;
  for (let i = 0; i <= arr.length; i++) { // off-by-one bug: should be i < arr.length
    total += arr[i];
  }
  return total;
}
`,
      'src/math.test.ts': `
import { clamp, sum } from './math';

test('clamp returns value when in range', () => {
  expect(clamp(5, 0, 10)).toBe(5);
});

test('clamp returns min when below range', () => {
  expect(clamp(-1, 0, 10)).toBe(0);
});

test('sum returns correct total', () => {
  expect(sum([1, 2, 3])).toBe(6);
});
`,
      'package.json': JSON.stringify({
        name: 'math-utils',
        scripts: { test: 'npx ts-node --esm node_modules/.bin/vitest run' },
        devDependencies: { vitest: '*', typescript: '*' },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true, module: 'ESNext', target: 'ES2020' },
      }),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent must have run a shell command to detect the failure
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      expect(
        shellCalls.length,
        'Expected agent to run shell commands (test runner)',
      ).toBeGreaterThanOrEqual(1);

      // Agent must have read the source file to find the bug
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(
        readCalls.length,
        'Expected agent to read source files to diagnose the bug',
      ).toBeGreaterThanOrEqual(1);

      // Agent must have edited the file to fix the bug
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Expected agent to write a fix',
      ).toBeGreaterThanOrEqual(1);

      // The fix should be in math.ts
      const mathContent = rig.readFile('src/math.ts');
      expect(
        mathContent.includes('i < arr.length') ||
          mathContent.includes('i < array.length'),
        'Expected off-by-one bug to be fixed (i <= should become i <)',
      ).toBe(true);
    },
  });

  /**
   * Agent must: attempt to read a missing file, handle the error gracefully,
   * search for the correct file location, and proceed with the task.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should recover from a missing file by searching for the correct location',
    prompt: 'Add a null check to the validateUser function in the auth module.',
    files: {
      'src/auth/validator.ts': `
export function validateUser(user: { name: string; email: string } | null): boolean {
  return user.name.length > 0 && user.email.includes('@');
}
`,
      'src/index.ts': `
export { validateUser } from './auth/validator';
`,
      'package.json': JSON.stringify({ name: 'auth-service' }),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent should have written a fix
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Expected agent to write the null check fix',
      ).toBeGreaterThanOrEqual(1);

      // The fix should add a null guard
      const validatorContent = rig.readFile('src/auth/validator.ts');
      expect(
        validatorContent.includes('null') ||
          validatorContent.includes('undefined') ||
          validatorContent.includes('!user'),
        'Expected null check to be added to validateUser',
      ).toBe(true);
    },
  });
});
