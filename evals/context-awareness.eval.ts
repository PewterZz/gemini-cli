/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Context Awareness', () => {
  /**
   * When the project uses TypeScript, the agent should write TypeScript
   * not JavaScript.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should write TypeScript when project uses TypeScript',
    prompt: 'Create a new utility function that formats dates as ISO strings.',
    files: {
      'tsconfig.json':
        '{"compilerOptions": {"strict": true, "target": "ES2020", "module": "commonjs"}}',
      'src/utils.ts': `
export function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2);
}
`,
      'package.json':
        '{"name": "ts-app", "devDependencies": {"typescript": "^5.0.0"}}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );

      // Check if any written file is .ts (not .js)
      const wroteTs = writeCalls.some((call) => {
        let args = call.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* */
          }
        }
        const filePath = typeof args === 'string' ? '' : args?.file_path || '';
        return filePath.endsWith('.ts');
      });

      // Also check if they modified the existing .ts file
      const modifiedTs = toolLogs.some((log) => {
        if (log.toolRequest.name !== 'replace') return false;
        let args = log.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            return false;
          }
        }
        return (args?.file_path || '').endsWith('.ts');
      });

      expect(
        wroteTs || modifiedTs,
        'Expected agent to write TypeScript in a TypeScript project',
      ).toBe(true);
    },
  });

  /**
   * When the project uses ESM (type: module), the agent should use import/export
   * not require/module.exports.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use ESM syntax when package.json has type module',
    prompt: 'Create a new helper.js file with a capitalize function.',
    files: {
      'package.json':
        '{"name": "esm-app", "type": "module", "version": "1.0.0"}',
      'src/utils.js': `
export function lower(s) { return s.toLowerCase(); }
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      expect(writeCalls.length).toBeGreaterThanOrEqual(1);

      // Find the written file path from tool args
      const writeCall = writeCalls[0];
      if (writeCall) {
        let args = writeCall.toolRequest.args;
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            /* skip */
          }
        }
        const filePath =
          typeof args === 'object' && args !== null
            ? (args as Record<string, string>).file_path
            : null;
        if (filePath) {
          const helperContent = rig.readFile(filePath);
          // Should use export, not module.exports
          expect(helperContent).toMatch(/export\s+(function|const|default)/);
          expect(helperContent).not.toContain('module.exports');
        }
      }
    },
  });

  /**
   * When the project has a .prettierrc or .editorconfig, the agent should
   * follow existing formatting conventions.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should follow project formatting conventions',
    prompt:
      'Add a new multiply function to math.js following the existing code style.',
    files: {
      'math.js': `
function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}

module.exports = { add, subtract };
`,
      '.editorconfig': `
[*]
indent_style = space
indent_size = 4
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('math.js');
      expect(content).toContain('multiply');
      // Existing functions should still be there
      expect(content).toContain('add');
      expect(content).toContain('subtract');
    },
  });

  /**
   * When the project has a specific test framework (jest vs mocha vs vitest),
   * the agent should use the right assertion style.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use the correct test framework syntax',
    prompt: 'Write a test for the greet function.',
    files: {
      'src/greet.js': `
function greet(name) {
  if (!name) return 'Hello, stranger!';
  return 'Hello, ' + name + '!';
}
module.exports = { greet };
`,
      'package.json':
        '{"devDependencies": {"jest": "^29.0.0"}, "scripts": {"test": "jest"}}',
      'jest.config.js': 'module.exports = { testEnvironment: "node" };',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file',
      );
      expect(writeCalls.length).toBeGreaterThanOrEqual(1);

      // Find test file
      const testFile =
        rig.readFile('src/greet.test.js') ||
        rig.readFile('test/greet.test.js') ||
        rig.readFile('__tests__/greet.test.js') ||
        rig.readFile('greet.test.js');

      if (testFile) {
        // Should use Jest syntax (expect/toBe), not Mocha (assert/chai)
        expect(testFile).toMatch(/expect|toBe|toEqual|toContain/);
        expect(testFile).toContain('greet');
      }
    },
  });

  /**
   * When the existing code uses semicolons, the agent should too.
   * When it doesn't, the agent should follow suit.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should match existing semicolon convention',
    prompt: 'Add a divide function to math.js.',
    files: {
      'math.js': `
const add = (a, b) => a + b
const subtract = (a, b) => a - b

module.exports = { add, subtract }
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('math.js');
      expect(content).toContain('divide');
      // Existing code has no semicolons, new code should match
      // Count semicolons -- should be minimal (0 or very few)
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const linesWithSemicolon = lines.filter((l) => l.trim().endsWith(';'));
      // Allow some tolerance but most lines should not have semicolons
      expect(linesWithSemicolon.length).toBeLessThan(lines.length / 2);
    },
  });
});
