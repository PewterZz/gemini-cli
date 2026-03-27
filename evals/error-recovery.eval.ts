/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

describe('Error Recovery', () => {
  /**
   * When the agent tries to read a file that does not exist, it should
   * recover by listing or searching the project rather than giving up.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should recover gracefully when reading a non-existent file',
    prompt: 'Show me the contents of config.yaml',
    files: {
      'app.js': 'console.log("hello");',
      'README.md': '# My App\nA simple application.',
    },
    assert: async (rig, result) => {
      // After failing to find config.yaml the agent should produce output,
      // not crash or silently stop.
      expect(
        result.length,
        'Expected agent to produce output after file-not-found error',
      ).toBeGreaterThan(0);
    },
  });

  /**
   * When a TypeScript project has a type error, the agent should:
   * 1. Run the compiler to discover the error
   * 2. Edit the correct source file
   * 3. Verify the fix compiles cleanly
   *
   * Ground truth: the broken file must not contain the type mismatch after
   * the agent finishes, and the agent must have run tsc at some point.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should diagnose a type error, fix it, and verify it compiles',
    timeout: 600000,
    files: {
      'src/math.ts': `
export function add(a: number, b: number): number {
  return a + b;
}
`,
      'src/app.ts': `
import { add } from './math.js';

// BUG: passing strings instead of numbers
const result = add('1', '2');
console.log(result);
`,
      'package.json': JSON.stringify({
        name: 'test-project',
        type: 'module',
        scripts: { build: 'tsc --noEmit' },
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
    prompt: 'Fix the type error in this project and verify it compiles.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent must have edited a file
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(
        editCalls.length,
        'Expected agent to edit a file to fix the type error',
      ).toBeGreaterThanOrEqual(1);

      // Agent must have run tsc or npm run build to verify
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const ranTypeCheck = shellCalls.some((log) => {
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
            : ((args as Record<string, string>)['command'] ?? '');
        return (
          cmd.includes('tsc') ||
          cmd.includes('npm run build') ||
          cmd.includes('npx tsc')
        );
      });
      expect(
        ranTypeCheck,
        'Expected agent to run tsc or build to verify the fix compiles',
      ).toBe(true);

      // The string-argument call should be gone
      const appContent = readFileOrFail(rig, 'src/app.ts');
      expect(
        appContent,
        'Expected src/app.ts to no longer pass string literals to add()',
      ).not.toMatch(/add\(\s*['"]/);
    },
  });

  /**
   * When tests are failing due to a bug in source code, the agent should:
   * 1. Run the test suite to observe the failure
   * 2. Edit the source file (not the test file)
   * 3. Confirm the fix passes the tests
   *
   * Ground truth: the bug in utils.ts must be fixed and the test file
   * must be unchanged.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should fix a failing test by editing source code, not the test',
    timeout: 600000,
    files: {
      'src/utils.ts': `
export function filterAbove(items: number[], threshold: number): number[] {
  // BUG: should be > not >=
  return items.filter((item) => item >= threshold);
}
`,
      'src/utils.test.ts': `
import { expect, test } from 'vitest';
import { filterAbove } from './utils.js';

test('filters items strictly above threshold', () => {
  expect(filterAbove([1, 2, 3, 4, 5], 3)).toEqual([4, 5]);
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
    prompt: 'The tests are failing. Fix the bug and make them pass.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent must have run the test suite
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
            : ((args as Record<string, string>)['command'] ?? '');
        return (
          cmd.includes('vitest') ||
          cmd.includes('npm test') ||
          cmd.includes('npm run test')
        );
      });
      expect(ranTests, 'Expected agent to run the test suite').toBe(true);

      // Agent must have edited a source file
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(
        editCalls.length,
        'Expected agent to edit a file to fix the bug',
      ).toBeGreaterThanOrEqual(1);

      // The bug in utils.ts must be fixed (>= changed to >)
      const utilsContent = readFileOrFail(rig, 'src/utils.ts');
      expect(
        utilsContent,
        'Expected utils.ts to use > instead of >= for the threshold comparison',
      ).toMatch(/item\s*>\s*threshold/);

      // The test file must be unchanged (agent should not cheat by lowering the bar)
      const testContent = readFileOrFail(rig, 'src/utils.test.ts');
      expect(
        testContent,
        'Expected test file to be unchanged — fix should be in source, not tests',
      ).toContain('toEqual([4, 5])');
    },
  });
});
