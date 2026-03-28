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
import { evalTest, readFileOrFail } from './test-helper.js';

const parseToolArgs = (rawArgs: unknown): Record<string, unknown> => {
  if (typeof rawArgs !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const normalizePath = (filePath: string): string => {
  const srcPathIndex = filePath.indexOf('src/');
  if (srcPathIndex >= 0) {
    return filePath.slice(srcPathIndex);
  }
  const packagePathIndex = filePath.indexOf('packages/');
  if (packagePathIndex >= 0) {
    return filePath.slice(packagePathIndex);
  }
  return filePath;
};

describe('L3 Advanced', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should find all callers before changing a function signature',
    prompt:
      'The formatDate function currently takes a Date object. Change it to take a unix timestamp (number) instead, and update all existing callers so they still work.',
    files: {
      'src/utils/date.ts': `
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export default formatDate;
export { formatDate };
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
      'packages/analytics/src/snapshot.ts': `
import dateFormatter from '../../../src/utils/date';

export function getSnapshotLabel(startDate: Date) {
  return \`snapshot-\${dateFormatter(startDate)}\`;
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const readCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );
      const readFiles = new Set<string>();
      for (const log of readCalls) {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        if (typeof filePath === 'string') {
          readFiles.add(normalizePath(filePath));
        }
        const paths = args['paths'];
        if (Array.isArray(paths)) {
          for (const pathValue of paths) {
            if (typeof pathValue === 'string') {
              readFiles.add(normalizePath(pathValue));
            }
          }
        }
      }
      expect(
        readFiles.size,
        'Expected agent to read at least 3 files before changing a signature',
      ).toBeGreaterThanOrEqual(3);

      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      const editedFiles = new Set<string>();
      for (const log of writeCalls) {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        if (typeof filePath === 'string') {
          editedFiles.add(normalizePath(filePath));
        }
      }
      expect(
        editedFiles.size,
        'Expected agent to edit at least two files when changing signature',
      ).toBeGreaterThanOrEqual(2);

      // formatDate should now accept timestamp number and callers should be updated.
      const dateContent = readFileOrFail(rig, 'src/utils/date.ts');
      expect(
        dateContent.includes('number') || dateContent.includes('timestamp'),
        'Expected formatDate signature to be updated for timestamp usage',
      ).toBe(true);

      const aliasedCaller = readFileOrFail(
        rig,
        'packages/analytics/src/snapshot.ts',
      );
      expect(
        aliasedCaller,
        'Expected aliased default-import caller to be updated for new signature',
      ).toContain('getTime()');
    },
  });
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
      'src/repositories/user-repository.ts': `
import { getUserById } from '../db/users';
import { RawUser } from '../types';

export async function fetchRawUser(id: number): Promise<RawUser> {
  return getUserById(id);
}
`,
      'src/services/user.ts': `
import { fetchRawUser } from '../repositories/user-repository';
import { UserRecord } from '../types';

export async function getUser(id: number): Promise<UserRecord> {
  return fetchRawUser(id); // type error: RawUser != UserRecord
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const firstEditIndex = toolLogs.findIndex(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      const preEditWindow =
        firstEditIndex >= 0 ? firstEditIndex : toolLogs.length;
      const readCalls = toolLogs
        .map((log, index) => ({ log, index }))
        .filter(
          ({ log, index }) =>
            index < preEditWindow &&
            (log.toolRequest.name === 'read_file' ||
              log.toolRequest.name === 'read_many_files'),
        );
      const uniqueReadFiles = new Set<string>();
      for (const { log } of readCalls) {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        if (typeof filePath === 'string') {
          uniqueReadFiles.add(normalizePath(filePath));
        }
        const paths = args['paths'];
        if (Array.isArray(paths)) {
          for (const pathValue of paths) {
            if (typeof pathValue === 'string') {
              uniqueReadFiles.add(normalizePath(pathValue));
            }
          }
        }
      }
      expect(
        uniqueReadFiles.size,
        'Expected at least 3 different files to be read before any edit',
      ).toBeGreaterThanOrEqual(3);

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
      const serviceContent = readFileOrFail(rig, 'src/services/user.ts');
      expect(
        serviceContent.includes('new Date') ||
          serviceContent.includes('createdAt') ||
          serviceContent.includes('convert') ||
          serviceContent.includes('map'),
        'Expected conversion from RawUser to UserRecord',
      ).toBe(true);
    },
  });
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

test.skip('red herring: intentionally failing and should stay skipped', () => {
  expect(sum([1, 2, 3])).toBe(999);
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
      const mathContent = readFileOrFail(rig, 'src/math.ts');
      expect(
        mathContent.includes('i < arr.length') ||
          mathContent.includes('i < array.length'),
        'Expected off-by-one bug to be fixed (i <= should become i <)',
      ).toBe(true);

      const mathTestContent = readFileOrFail(rig, 'src/math.test.ts');
      expect(
        mathTestContent,
        'Expected skipped red-herring test to remain skipped',
      ).toContain(
        "test.skip('red herring: intentionally failing and should stay skipped'",
      );
    },
  });
  evalTest('USUALLY_PASSES', {
    name: 'should recover from a missing file by searching for the correct location',
    prompt:
      'Add a null check to the validateUser function in auth/user.ts in the auth module.',
    files: {
      'src/auth/validators/user.ts': `
export function validateUser(user: { name: string; email: string } | null): boolean {
  return user.name.length > 0 && user.email.includes('@');
}
`,
      'src/auth/user.ts': `
export const userEntity = { table: 'users' };
`,
      'src/auth/validator.ts': `
export function validateToken(token: string): boolean {
  return token.length > 0;
}
`,
      'src/auth/validators/index.ts': `
export const authValidators = ['token'];
`,
      'src/modules/auth/user.ts': `
export function buildUserLabel(name: string): string {
  return \`user:\${name}\`;
}
`,
      'src/index.ts': `
export { validateUser } from './auth/validators/user';
`,
      'package.json': JSON.stringify({ name: 'auth-service' }),
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const searchCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'glob',
      );
      expect(
        searchCalls.length,
        'Expected agent to use search/glob to find validateUser in non-obvious path',
      ).toBeGreaterThanOrEqual(1);

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
      const validatorContent = readFileOrFail(
        rig,
        'src/auth/validators/user.ts',
      );
      expect(
        validatorContent.includes('null') ||
          validatorContent.includes('undefined') ||
          validatorContent.includes('!user'),
        'Expected null check to be added to validateUser',
      ).toBe(true);
    },
  });
});
