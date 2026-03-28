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

const optimizedMultiplyAssertion =
  'expect(multiplyOptimizedForLargeNumbers(123, 45)).toBe(5535);';

const optimizedMultiplyImplementation = `export function multiplyOptimizedForLargeNumbers(a: number, b: number): number {
  let result = 0;
  let multiplicand = Math.abs(a);
  let multiplier = Math.abs(b);

  while (multiplier > 0) {
    if (multiplier % 2 === 1) {
      result += multiplicand;
    }
    multiplicand += multiplicand;
    multiplier = Math.floor(multiplier / 2);
  }

  return (a < 0) !== (b < 0) ? -result : result;
}`;

const clampPassingAssertions = [
  'expect(clamp(4.999, 0, 10)).toBe(4.999);',
  'expect(clamp(-0.01, 0, 10)).toBe(0);',
  'expect(clamp(10.01, 0, 10)).toBe(10);',
];

const lerpEdgeCaseAssertions = [
  'expect(lerp(10, 20, 0)).toBe(10);',
  'expect(lerp(10, 20, 1)).toBe(20);',
  'expect(lerp(10, 20, 0.5)).toBe(15);',
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
  return a + b; // BUG: subtle typo, should be multiplication
}

export function multiplyOptimizedForLargeNumbers(a: number, b: number): number {
  let result = 0;
  let multiplicand = Math.abs(a);
  let multiplier = Math.abs(b);

  while (multiplier > 0) {
    if (multiplier % 2 === 1) {
      result += multiplicand;
    }
    multiplicand += multiplicand;
    multiplier = Math.floor(multiplier / 2);
  }

  return (a < 0) !== (b < 0) ? -result : result;
}
`,
      'src/math.test.ts': `
import { expect, test } from 'vitest';
import { add, multiply, multiplyOptimizedForLargeNumbers } from './math.js';

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

test('multiply optimized stays correct for large-ish numbers', () => {
  expect(multiplyOptimizedForLargeNumbers(123, 45)).toBe(5535);
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
      'The multiply test is failing. Fix only the original multiply implementation in math.ts, keep the optimized large-number implementation untouched, and ensure all tests pass.',
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
      expect(mathContent).toMatch(
        /export function multiply\(a: number, b: number\): number\s*{\s*return a \* b;/,
      );

      // add function must remain intact
      expect(mathContent).toContain('a + b');
      expect(
        mathContent,
        'Expected optimized implementation to remain unchanged',
      ).toContain(optimizedMultiplyImplementation);

      const mathTestContent = readFileOrFail(rig, 'src/math.test.ts');
      for (const assertion of mathPassingAssertions) {
        expect(
          mathTestContent,
          `Expected passing assertion to remain unchanged: ${assertion}`,
        ).toContain(assertion);
      }
      expect(mathTestContent).toContain(optimizedMultiplyAssertion);
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
  return start + end * t; // BUG: should account for distance from start and handle edge cases
}
`,
      'src/utils.test.ts': `
import { expect, test } from 'vitest';
import { clamp, lerp } from './utils.js';

test('clamp returns value when in range', () => {
  expect(clamp(4.999, 0, 10)).toBe(4.999);
});

test('clamp returns min when below range', () => {
  expect(clamp(-0.01, 0, 10)).toBe(0);
});

test('clamp returns max when above range', () => {
  expect(clamp(10.01, 0, 10)).toBe(10);
});

test('lerp returns start when t is 0', () => {
  expect(lerp(10, 20, 0)).toBe(10);
});

test('lerp reaches end when t is 1', () => {
  expect(lerp(10, 20, 1)).toBe(20); // fails currently
});

test('lerp returns midpoint when t is 0.5', () => {
  expect(lerp(10, 20, 0.5)).toBe(15); // fails currently
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
      'A new lerp feature test suite was added. Fix lerp in utils.ts so edge cases pass (t=0, t=1, t=0.5), run tests, and do not change the three existing clamp assertions.',
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

      // lerp function must be fixed with explicit edge-case handling
      const content = readFileOrFail(rig, 'src/utils.ts');
      expect(content).toContain('lerp');
      expect(content).toMatch(/if\s*\(t\s*===\s*0\)\s*{\s*return\s+start;\s*}/);
      expect(content).toMatch(/if\s*\(t\s*===\s*1\)\s*{\s*return\s+end;\s*}/);
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
      for (const assertion of lerpEdgeCaseAssertions) {
        expect(
          utilsTestContent,
          `Expected lerp edge-case assertion to remain present: ${assertion}`,
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
export function add(a: number, b: number): number { return a + b; }
export function sub(a: number, b: number): number { return a - b; }
export function mul(a: number, b: number): number { return a * b; }
export function div(a: number, b: number): number { return a / b; }
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
      'Refactor calculator.ts for readability, fix divide-by-zero to throw, update div return type to number | never, and verify tests still pass.',
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
      expect(content).toMatch(
        /export function div\(a: number, b: number\): number \| never/,
      );
      expect(content).toMatch(/b\s*===\s*0/);
      expect(content).toMatch(/throw new Error\(['"]division by zero['"]\)/);

      const calculatorTestContent = readFileOrFail(
        rig,
        'src/calculator.test.ts',
      );
      expect(calculatorTestContent).toContain(
        "expect(() => div(10, 0)).toThrow('division by zero')",
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
