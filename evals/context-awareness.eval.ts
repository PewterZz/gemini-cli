/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';

const tryReadFile = (
  rig: { readFile: (fileName: string) => string },
  filePath: string,
): string | null => {
  try {
    return rig.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

describe('Context Awareness', () => {
  /**
   * When the project uses TypeScript, the agent should write TypeScript
   * not JavaScript.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should write TypeScript when project uses TypeScript',
    prompt:
      'Create src/date-utils.ts with a formatIsoDate(date: Date): string helper. Follow the TypeScript ESM project config, not the legacy CommonJS files.',
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
        include: ['src/**/*.ts'],
      }),
      'src/legacy/date-utils.js': `
const moment = require('moment');

function formatDateLegacy(value) {
  return moment(value).format('YYYY-MM-DD');
}

module.exports = { formatDateLegacy };
`,
      'src/legacy/index.js': `
const { formatDateLegacy } = require('./date-utils');
module.exports = { formatDateLegacy };
`,
      'package.json':
        '{"name": "ts-app", "type": "module", "scripts": {"build": "tsc --noEmit"}, "devDependencies": {"typescript": "^5.0.0"}}',
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'src/date-utils.ts');
      expect(content).toContain('formatIsoDate');
      expect(content).toMatch(/export\s+(function|const)/);
      expect(content).not.toContain('require(');
      expect(content).not.toContain('module.exports');
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
            ? (args as Record<string, string>)['file_path']
            : null;
        if (filePath) {
          const helperContent = readFileOrFail(rig, filePath);
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
      const content = readFileOrFail(rig, 'math.js');
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
    prompt:
      "Add one more test case for greet() that covers punctuation in names. Follow this repo's existing test framework.",
    files: {
      'src/greet.js': `
function greet(name) {
  if (!name) return 'Hello, stranger!';
  return 'Hello, ' + name + '!';
}
module.exports = { greet };
`,
      'src/greet.test.js': `
import { describe, it, expect } from 'vitest';
import { greet } from './greet.js';

describe('greet', () => {
  it('greets a known user', () => {
    expect(greet('Ada')).toBe('Hello, Ada!');
  });
});
`,
      'package.json':
        '{"devDependencies": {"jest": "^29.0.0", "vitest": "^2.1.0"}, "scripts": {"test": "vitest run"}}',
      'jest.config.js': 'module.exports = { testEnvironment: "node" };',
    },
    assert: async (rig) => {
      const candidatePaths = ['src/greet.test.js', 'src/greet.spec.js'];
      const discoveredTestFile = candidatePaths
        .map((filePath) => ({ filePath, content: tryReadFile(rig, filePath) }))
        .find(({ content }) => content !== null);

      expect(discoveredTestFile).toBeTruthy();

      const testFile = discoveredTestFile?.content;
      if (!testFile) {
        return;
      }

      expect(testFile).toContain('describe');
      expect(testFile).toContain('it(');
      expect(testFile).toContain('greet');
      expect(testFile).not.toMatch(/from ['"]@jest\/globals['"]/);
      expect(testFile).not.toMatch(/\bjest\.(fn|spyOn|mock)\b/);
    },
  });

  /**
   * When the existing code uses semicolons, the agent should too.
   * When it doesn't, the agent should follow suit.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should match existing semicolon convention',
    prompt:
      'Inside createCalculator in math.js, add a divide function next to multiply and include it in the returned object. Match the surrounding indentation in that block.',
    files: {
      'math.js': `
function createCalculator() {
    function multiply(a, b) {
        return a * b;
    }

  function add(a, b) {
    return a + b;
  }

    return { multiply, add };
}

module.exports = { createCalculator };
`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'math.js');
      expect(content).toContain('divide');
      expect(content).toMatch(
        /\n {4}function divide\(a, b\) \{\n {8}[^\n]+\n {4}\}/,
      );
      expect(content).not.toMatch(
        /\n {2}function divide\(a, b\) \{\n {4}return a \/ b;\n {2}\}/,
      );
    },
  });
});
