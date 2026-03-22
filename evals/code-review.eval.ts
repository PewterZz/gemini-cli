/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Code Review', () => {
  /**
   * When reviewing code, the agent should identify real bugs, not just
   * style issues.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should identify a real bug during code review',
    prompt:
      'Review this pull request change in diff.ts and tell me if there are any bugs.',
    files: {
      'diff.ts': `
// BEFORE (original):
// function divide(a: number, b: number): number {
//   return a / b;
// }

// AFTER (proposed change):
export function divide(a: number, b: number): number {
  if (b === 0) {
    return 0; // BUG: should throw or return NaN, not 0
  }
  return a / b;
}
`,
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // Agent should have read the file
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);

      // Response should identify the bug
      expect(result).toMatch(
        /bug|incorrect|wrong|issue|problem|zero|silent|NaN|throw/i,
      );
    },
  });

  /**
   * When reviewing code for security issues, the agent should identify
   * injection vulnerabilities.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should identify SQL injection in a code review',
    prompt: 'Review this database query code in db.ts for security issues.',
    files: {
      'db.ts': `
import { pool } from './pool.js';

// SECURITY ISSUE: unsanitized input directly in query
export async function getUserByName(name: string) {
  const result = await pool.query(
    \`SELECT * FROM users WHERE name = '\${name}'\`
  );
  return result.rows[0];
}
`,
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);

      // Response must mention SQL injection or parameterized queries
      expect(result).toMatch(/injection|sanitiz|parameteriz|prepared|unsafe/i);
    },
  });

  /**
   * When asked to review code, the agent should not make unrequested changes.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should provide review feedback without modifying files',
    prompt: 'Review auth.ts and give me your feedback on the code quality.',
    files: {
      'auth.ts': `
export function hashPassword(password: string): string {
  // Simple hash for demonstration
  return Buffer.from(password).toString('base64');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should have read the file
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);

      // Should NOT have modified any files
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Agent should not modify files when asked to review',
      ).toBe(0);
    },
  });

  /**
   * When reviewing a breaking API change, the agent should flag the impact.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should flag a breaking change in a function signature',
    prompt: 'Review this change to api.ts — is this a breaking change?',
    files: {
      'api.ts': `
// BEFORE (callers use: fetchUser(id))
// export async function fetchUser(id: number) {
//   return db.findById(id);
// }

// AFTER (proposed change adds required second parameter)
export async function fetchUser(id: number, includeDeleted: boolean) {
  return db.findById(id, includeDeleted);
}
`,
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // Must have read the file
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(
        readCalls.length,
        'Expected agent to read the file before reviewing',
      ).toBeGreaterThanOrEqual(1);

      // Response should identify this as a breaking change
      expect(result).toMatch(/break|backward|compat|caller|requir|existing/i);
    },
  });

  /**
   * When reviewing code with performance issues, the agent should
   * identify them.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should identify O(n^2) performance issue in code review',
    prompt:
      'Review this code in search.ts. Are there any performance concerns?',
    files: {
      'search.ts': `
export function findDuplicates(arr: number[]): number[] {
  const duplicates: number[] = [];
  // O(n^2) nested loop
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}
`,
    },
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);

      // Should identify the performance issue
      expect(result).toMatch(
        /O\(n|quadratic|nested|loop|performance|Set|Map|linear/i,
      );
    },
  });
});
