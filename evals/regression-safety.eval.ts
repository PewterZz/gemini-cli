/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

const mathPassingAssertions = [
  'expect(add(2, 3)).toBe(5);',
  'expect(add(-1, 1)).toBe(0);',
  'expect(add(0, 7)).toBe(7);',
  'expect(add(1.5, 2.5)).toBe(4);',
];

const clampPassingAssertions = [
  'expect(clamp(5, 0, 10)).toBe(5);',
  'expect(clamp(-5, 0, 10)).toBe(0);',
  'expect(clamp(15, 0, 10)).toBe(10);',
  'expect(clamp(0, 0, 10)).toBe(0);',
];

const calculatorPassingAssertions = [
  'expect(add(2, 3)).toBe(5)',
  'expect(sub(5, 3)).toBe(2)',
  'expect(mul(3, 4)).toBe(12)',
  'expect(div(10, 2)).toBe(5)',
];

describe('Regression Safety', () => {
  /**
   * When fixing a bug, the agent should not break existing passing tests.
   * This is the PASS_TO_PASS requirement from SWE-bench methodology.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not break existing tests while fixing a bug',
    timeout: 600000,
    files: {
      'src/math.ts': `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a - b; // BUG: should be multiplication
}
`,
      'src/math.test.ts': `
import { expect, test } from 'vitest';
import { add, multiply } from './math.js';

test('add handles positive numbers', () => {
  expect(add(2, 3)).toBe(5);
});

test('add handles negatives', () => {
  expect(add(-1, 1)).toBe(0);
});

test('add keeps identity with zero', () => {
  expect(add(0, 7)).toBe(7);
});

test('add handles decimals', () => {
  expect(add(1.5, 2.5)).toBe(4);
});

test('multiply is broken', () => {
  expect(multiply(3, 4)).toBe(12); // fails currently
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
      'The multiply test is failing. Fix the bug without breaking the add test.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent must have edited a file
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(
        editCalls.length,
        'Expected agent to edit a file',
      ).toBeGreaterThanOrEqual(1);

      // multiply should be fixed
      const mathContent = readFileOrFail(rig, 'src/math.ts');
      expect(mathContent).toContain('a * b');

      // add function must remain intact
      expect(mathContent).toContain('a + b');

      const mathTestContent = readFileOrFail(rig, 'src/math.test.ts');
      for (const assertion of mathPassingAssertions) {
        expect(
          mathTestContent,
          `Expected passing assertion to remain unchanged: ${assertion}`,
        ).toContain(assertion);
      }
    },
  });

  /**
   * When adding a new feature, the agent should run the test suite
   * to confirm nothing was broken.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should verify existing tests still pass after adding a feature',
    timeout: 600000,
    files: {
      'src/utils.ts': `
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, t: number): number {
  return start + end * t; // BUG: should account for distance from start
}
`,
      'src/utils.test.ts': `
import { expect, test } from 'vitest';
import { clamp, lerp } from './utils.js';

test('clamp returns value when in range', () => {
  expect(clamp(5, 0, 10)).toBe(5);
});

test('clamp returns min when below range', () => {
  expect(clamp(-5, 0, 10)).toBe(0);
});

test('clamp returns max when above range', () => {
  expect(clamp(15, 0, 10)).toBe(10);
});

test('clamp includes lower bound', () => {
  expect(clamp(0, 0, 10)).toBe(0);
});

test('lerp reaches end when t is 1', () => {
  expect(lerp(10, 20, 1)).toBe(20); // fails currently
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
      'The lerp test is failing. Fix lerp in utils.ts and run the tests without changing the passing clamp assertions.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent must have run tests
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const ranTests = shellCalls.some((log) => {
        let args = log.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /**/
          }
        }
        const cmd =
          typeof args === 'string'
            ? args
            : ((args as Record<string, string>)['command'] ?? '');
        return cmd.includes('vitest') || cmd.includes('npm test');
      });
      expect(
        ranTests,
        'Expected agent to run tests after adding the feature',
      ).toBe(true);

      // lerp function must be added
      const content = readFileOrFail(rig, 'src/utils.ts');
      expect(content).toContain('lerp');
      expect(content).toMatch(/start\s*\+\s*\(end\s*-\s*start\)\s*\*\s*t/);

      // clamp must still be there
      expect(content).toContain('clamp');

      const utilsTestContent = readFileOrFail(rig, 'src/utils.test.ts');
      for (const assertion of clampPassingAssertions) {
        expect(
          utilsTestContent,
          `Expected passing assertion to remain unchanged: ${assertion}`,
        ).toContain(assertion);
      }
    },
  });

  /**
   * When refactoring, the agent should confirm tests still pass.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should run tests after refactoring to confirm no regression',
    timeout: 600000,
    files: {
      'src/calculator.ts': `
export function add(a: number, b: number) { return a + b; }
export function sub(a: number, b: number) { return a - b; }
export function mul(a: number, b: number) { return a * b; }
export function div(a: number, b: number) { return a / b; }
`,
      'src/calculator.test.ts': `
import { expect, test } from 'vitest';
import { add, sub, mul, div } from './calculator.js';

test('add', () => expect(add(2, 3)).toBe(5));
test('sub', () => expect(sub(5, 3)).toBe(2));
test('mul', () => expect(mul(3, 4)).toBe(12));
test('div', () => expect(div(10, 2)).toBe(5));
test('div throws on zero denominator', () =>
  expect(() => div(10, 0)).toThrow('division by zero')); // fails currently
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
      'Refactor calculator.ts for readability, fix the failing divide-by-zero behavior, and verify tests still pass.',
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Must have edited the file
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(editCalls.length).toBeGreaterThanOrEqual(1);

      // Must have run tests
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );
      const ranTests = shellCalls.some((log) => {
        let args = log.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /**/
          }
        }
        const cmd =
          typeof args === 'string'
            ? args
            : ((args as Record<string, string>)['command'] ?? '');
        return cmd.includes('vitest') || cmd.includes('npm test');
      });
      expect(ranTests, 'Expected agent to verify tests after refactoring').toBe(
        true,
      );

      // All four functions must still exist
      const content = readFileOrFail(rig, 'src/calculator.ts');
      expect(content).toContain('add');
      expect(content).toContain('sub');
      expect(content).toContain('mul');
      expect(content).toContain('div');
      expect(content).toMatch(/b\s*===\s*0|division by zero/i);

      const calculatorTestContent = readFileOrFail(
        rig,
        'src/calculator.test.ts',
      );
      for (const assertion of calculatorPassingAssertions) {
        expect(
          calculatorTestContent,
          `Expected passing assertion to remain unchanged: ${assertion}`,
        ).toContain(assertion);
      }
    },
  });
});
