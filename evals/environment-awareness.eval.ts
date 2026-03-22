/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Environment Awareness', () => {
  /**
   * When the project has a package.json with a specific test script,
   * the agent should use that script, not a generic command.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use the project test script, not a generic test command',
    prompt: 'Run the tests for this project.',
    files: {
      'package.json': JSON.stringify({
        name: 'my-app',
        scripts: {
          test: 'jest --coverage',
          lint: 'eslint src/',
        },
      }),
      'src/app.js': 'module.exports = {};',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const shellCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'run_shell_command',
      );

      // Should run npm test or the jest command directly
      const ranCorrectCommand = shellCalls.some((log) => {
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
            : ((args as Record<string, string>).command ?? '');
        return (
          cmd.includes('npm test') ||
          cmd.includes('npm run test') ||
          cmd.includes('jest')
        );
      });
      expect(
        ranCorrectCommand,
        'Expected agent to use the project test script',
      ).toBe(true);
    },
  });

  /**
   * When the project uses TypeScript, the agent should produce TS code
   * not plain JS.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should write TypeScript when the project uses TypeScript',
    prompt: 'Add a new helper function called formatCurrency to helpers.ts.',
    files: {
      'helpers.ts': `
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`,
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true, target: 'ESNext' },
      }),
    },
    assert: async (rig) => {
      const content = rig.readFile('helpers.ts');

      // New function must exist
      expect(content).toContain('formatCurrency');

      // Should use TypeScript syntax (type annotations)
      expect(content).toMatch(/:\s*(string|number)/);
    },
  });

  /**
   * When the project has an .nvmrc or engines field, the agent should
   * not suggest features incompatible with that Node version.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should check package.json before suggesting modern syntax',
    prompt: 'Add a deep clone function to utils.js using modern JavaScript.',
    files: {
      'utils.js': 'module.exports = {};\n',
      'package.json': JSON.stringify({
        name: 'legacy-app',
        engines: { node: '>=14.0.0' },
      }),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent should have read package.json to check environment
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(
        readCalls.length,
        'Expected agent to read project files',
      ).toBeGreaterThanOrEqual(1);

      // Should have added the function
      const content = rig.readFile('utils.js');
      expect(content).toMatch(/clone|copy|deep/i);
    },
  });

  /**
   * When the project uses ESM (type: module), the agent should use
   * import/export, not require/module.exports.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use ESM syntax in an ESM project',
    prompt: 'Add a formatDate utility function to utils.js.',
    files: {
      'utils.js': `
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`,
      'package.json': JSON.stringify({
        name: 'esm-app',
        type: 'module',
      }),
    },
    assert: async (rig) => {
      const content = rig.readFile('utils.js');

      // Should use export, not module.exports
      expect(content).toContain('export');
      expect(content).not.toContain('module.exports');

      // New function exists
      expect(content).toContain('formatDate');
    },
  });

  /**
   * When the project has a linter config, the agent should follow it
   * rather than introducing style inconsistencies.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should follow existing code style when adding to a file',
    prompt:
      'Add a subtract function to math.js following the same style as the existing code.',
    files: {
      'math.js': `'use strict'

const add = (a, b) => {
  return a + b
}

const multiply = (a, b) => {
  return a * b
}

module.exports = { add, multiply }
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('math.js');

      // Should have added subtract
      expect(content).toContain('subtract');

      // Should use arrow function style (matching existing code)
      expect(content).toMatch(/=\s*\(.*\)\s*=>/);

      // Should preserve existing functions
      expect(content).toContain('add');
      expect(content).toContain('multiply');
    },
  });
});
