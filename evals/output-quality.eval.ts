/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import { EDIT_TOOL_NAMES } from '@google/gemini-cli-core';

describe('Output Quality', () => {
  /**
   * Generated code should be syntactically valid -- no syntax errors.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should produce syntactically valid JSON when editing a JSON file',
    prompt:
      'Add a "scripts" field to package.json with a "start" script that runs "node index.js".',
    files: {
      'package.json': JSON.stringify(
        {
          name: 'my-app',
          version: '1.0.0',
          dependencies: { express: '^4.18.0' },
        },
        null,
        2,
      ),
    },
    assert: async (rig) => {
      const content = rig.readFile('package.json');

      // Must be valid JSON
      let parsed: Record<string, unknown>;
      expect(() => {
        parsed = JSON.parse(content);
      }, 'package.json must be valid JSON after edit').not.toThrow();

      // Must have the scripts field
      expect(
        (parsed! as Record<string, Record<string, string>>).scripts?.start,
      ).toBe('node index.js');

      // Must preserve existing fields
      expect((parsed! as Record<string, string>).name).toBe('my-app');
    },
  });

  /**
   * When writing a function, the agent should handle the edge case
   * that was explicitly described in the prompt.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should handle the edge case mentioned in the prompt',
    prompt:
      'Write a safeDiv function in math.js that divides two numbers but returns null if the divisor is zero.',
    files: {
      'math.js': 'module.exports = {};\n',
    },
    assert: async (rig) => {
      const content = rig.readFile('math.js');

      // Function exists
      expect(content).toContain('safeDiv');

      // Handles zero divisor — should return null for zero
      expect(content).toMatch(/null|=== 0|== 0/);
    },
  });

  /**
   * When asked to write a function with specific behavior, the agent
   * should match the specification exactly.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should match the exact function specification',
    prompt:
      'Write a function called "range" in utils.js that takes start and end parameters and returns an array of integers from start to end inclusive.',
    files: {
      'utils.js': 'module.exports = {};\n',
    },
    assert: async (rig) => {
      const content = rig.readFile('utils.js');

      // Function exists with correct name
      expect(content).toContain('range');

      // Takes start and end parameters
      expect(content).toMatch(/range\s*\(\s*\w+\s*,\s*\w+\s*\)/);
    },
  });

  /**
   * When writing TypeScript, the agent should add proper type annotations,
   * not use 'any' everywhere.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add proper TypeScript types, not use any',
    prompt:
      'Add a getUserById function to users.ts that takes an id and returns a User object.',
    files: {
      'users.ts': `
export interface User {
  id: number;
  name: string;
  email: string;
}

const users: User[] = [];
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('users.ts');

      // Function must exist
      expect(content).toContain('getUserById');

      // Should use proper types, not any
      expect(content).not.toMatch(/:\s*any\b/);

      // Should reference the User interface
      expect(content).toContain('User');
    },
  });

  /**
   * When writing code that involves error handling, the agent should
   * use meaningful error messages.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should write meaningful error messages, not generic ones',
    prompt:
      'Add input validation to the createUser function in users.js. Throw errors with meaningful messages.',
    files: {
      'users.js': `
function createUser(name, email) {
  return { name, email, id: Date.now() };
}

module.exports = { createUser };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const editCalls = toolLogs.filter((log) =>
        EDIT_TOOL_NAMES.has(log.toolRequest.name),
      );
      expect(editCalls.length).toBeGreaterThanOrEqual(1);

      const content = rig.readFile('users.js');

      // Should have validation with throw
      expect(content).toContain('throw');

      // Error messages should reference what's wrong, not be generic
      expect(content).toMatch(/name|email|required|valid|invalid/i);
    },
  });
});
