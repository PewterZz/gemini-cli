/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * L3 evals: codebase-wide context and cross-module reasoning.
 *
 * These test the agent's ability to understand a multi-file codebase,
 * trace a bug across module boundaries, and make a targeted fix without
 * touching unrelated code. Complexity: L3 (codebase-wide context).
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('L3 Codebase-Wide Context', () => {
  /**
   * Agent must: find all callers of a function before changing its signature,
   * update both the function and all call sites.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should find all callers before changing a function signature',
    prompt:
      'The formatDate function currently takes a Date object. Change it to also accept a unix timestamp (number). Make sure all existing callers still work.',
    files: {
      'src/utils/date.ts': `
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
`,
      'src/reports/weekly.ts': `
import { formatDate } from '../utils/date';

export function getWeeklyReport(startDate: Date) {
  return { period: formatDate(startDate), data: [] };
}
`,
      'src/reports/monthly.ts': `
import { formatDate } from '../utils/date';

export function getMonthlyReport(startDate: Date) {
  return { period: formatDate(startDate), data: [] };
}
`,
      'src/api/handler.ts': `
import { formatDate } from '../utils/date';

export function handleRequest(timestamp: number) {
  const date = new Date(timestamp);
  return { formatted: formatDate(date) };
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent should have searched for callers
      const searchCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'run_shell_command',
      );
      expect(
        searchCalls.length,
        'Expected agent to search for callers of formatDate',
      ).toBeGreaterThanOrEqual(1);

      // Agent should have modified date.ts
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Expected agent to make edits',
      ).toBeGreaterThanOrEqual(1);

      // formatDate should now accept number | Date
      const dateContent = rig.readFile('src/utils/date.ts');
      expect(
        dateContent.includes('number') || dateContent.includes('timestamp'),
        'Expected formatDate to be updated to accept timestamps',
      ).toBe(true);
    },
  });

  /**
   * Agent must trace a type error from its symptom (usage site) back to
   * its source (type definition) across multiple files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should trace a type mismatch to its source across module boundaries',
    prompt:
      'There is a type mismatch: the user service expects a UserRecord but the database layer returns a RawUser. Find where the mismatch is and add the necessary conversion.',
    files: {
      'src/types.ts': `
export interface UserRecord {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export interface RawUser {
  id: number;
  name: string;
  email: string;
  created_at: string; // ISO string, not Date
}
`,
      'src/db/users.ts': `
import { RawUser } from '../types';

export async function getUserById(id: number): Promise<RawUser> {
  // Simulated DB response
  return { id, name: 'Alice', email: 'alice@example.com', created_at: '2024-01-01T00:00:00Z' };
}
`,
      'src/services/user.ts': `
import { getUserById } from '../db/users';
import { UserRecord } from '../types';

export async function getUser(id: number): Promise<UserRecord> {
  return getUserById(id); // type error: RawUser != UserRecord
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent should have read multiple files to trace the issue
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(
        readCalls.length,
        'Expected agent to read multiple files to trace the type mismatch',
      ).toBeGreaterThanOrEqual(2);

      // Agent should have written a fix
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Expected a fix to be written',
      ).toBeGreaterThanOrEqual(1);

      // Fix should involve conversion (new Date or mapping)
      const serviceContent = rig.readFile('src/services/user.ts');
      expect(
        serviceContent.includes('new Date') ||
          serviceContent.includes('createdAt') ||
          serviceContent.includes('convert') ||
          serviceContent.includes('map'),
        'Expected conversion from RawUser to UserRecord',
      ).toBe(true);
    },
  });
});
