/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
} from '@google/gemini-cli-core';

type ToolLog = {
  toolRequest: {
    name: string;
    args: string;
    success: boolean;
  };
};

const READ_TOOL_NAMES = new Set([
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
]);
const EDIT_TOOL_NAMES = new Set([WRITE_FILE_TOOL_NAME, EDIT_TOOL_NAME]);
const WEB_TOOL_NAMES = new Set([WEB_SEARCH_TOOL_NAME, WEB_FETCH_TOOL_NAME]);
const TRACKED_TOOL_NAMES = new Set([
  GREP_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
]);

const parseToolArgs = (rawArgs: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return { command: rawArgs };
  } catch {
    return { command: rawArgs };
  }
};

const getTrackedLogs = (rig: { readToolLogs: () => ToolLog[] }): ToolLog[] =>
  rig
    .readToolLogs()
    .filter((log) => TRACKED_TOOL_NAMES.has(log.toolRequest.name));

const getReadLikeCalls = (logs: ToolLog[]): ToolLog[] =>
  logs.filter((log) => READ_TOOL_NAMES.has(log.toolRequest.name));

const getEditCalls = (logs: ToolLog[]): ToolLog[] =>
  logs.filter((log) => EDIT_TOOL_NAMES.has(log.toolRequest.name));

const getWebCalls = (logs: ToolLog[]): ToolLog[] =>
  logs.filter((log) => WEB_TOOL_NAMES.has(log.toolRequest.name));

const getShellCommand = (log: ToolLog): string => {
  const args = parseToolArgs(log.toolRequest.args);
  const command = args['command'];
  return typeof command === 'string' ? command : '';
};

describe('Tool Selection', () => {
  evalTest('USUALLY_PASSES', {
    name: 'ci failure with local pass should trigger env-pattern search',
    prompt:
      'The CI pipeline is failing but all tests pass locally. Help me understand why.',
    files: {
      '.env':
        'NODE_ENV=development\nAPI_BASE_URL=http://localhost:3000\nFEATURE_FLAGS=local\nDB_HOST=localhost\n',
      '.env.ci':
        'NODE_ENV=test\nAPI_BASE_URL=http://ci.internal:8080\nFEATURE_FLAGS=ci\nDB_HOST=postgres-ci\nPAYMENTS_ENDPOINT=https://payments.internal\n',
      'src/config.ts': `
import fs from 'node:fs';

export function loadConfig() {
  const envFile = process.env['CI'] ? '.env.ci' : '.env';
  const raw = fs.readFileSync(envFile, 'utf8');
  return Object.fromEntries(
    raw
      .split(/\n/)
      .filter(Boolean)
      .map((line) => line.split('=')),
  );
}
`,
      'src/api.ts': `
import { loadConfig } from './config.js';

export function getPaymentsEndpoint() {
  const cfg = loadConfig();
  return cfg['PAYMENTS_ENDPOINT'] || 'http://localhost:4100';
}
`,
      'src/index.ts': 'export const boot = () => true;\n',
      'src/health.ts': 'export const health = () => ({ ok: true });\n',
      'src/logger.ts': 'export const logger = console;\n',
      'src/routes/users.ts': 'export const usersRoute = "/api/users";\n',
      'src/routes/orders.ts': 'export const ordersRoute = "/api/orders";\n',
      'tests/config.test.ts':
        'import { describe, it, expect } from "vitest";\ndescribe("config", () => { it("loads", () => expect(true).toBe(true)); });\n',
      'README.md':
        '# Project\nRun tests locally with `npm test`. CI runs with `CI=true npm test`.\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const grepCalls = logs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );
      const shellCalls = logs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );
      const editCalls = getEditCalls(logs);
      const webCalls = getWebCalls(logs);

      expect(
        grepCalls.length,
        'Expected env-focused grep usage for CI/local divergence',
      ).toBeGreaterThanOrEqual(1);
      expect(
        shellCalls.length + editCalls.length,
        'Expected either shell diagnosis or a concrete file edit',
      ).toBeGreaterThanOrEqual(1);
      expect(webCalls.length, 'This scenario should not need web tools').toBe(
        0,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'memory leak investigation should trace route to cache bug',
    prompt:
      'Something is causing memory leaks in production. The monitoring shows heap growing after requests to /api/users.',
    files: {
      'src/routes.ts': `
import { attachRequestContext } from './middleware.js';
import { fetchUsers } from './models/user.js';
import { cacheUsersPage } from './utils/cache.js';

export async function usersRoute(req: { query: Record<string, string | undefined> }) {
  attachRequestContext(req);
  const page = Number(req.query['page'] || '1');
  const users = await fetchUsers(page);
  return cacheUsersPage(page, users);
}
`,
      'src/middleware.ts': `
export function attachRequestContext(req: { requestId?: string }) {
  req.requestId = Math.random().toString(16).slice(2);
}
`,
      'src/models/user.ts': `
export async function fetchUsers(page: number) {
  return [{ id: page * 10 + 1, email: 'a@example.com' }];
}
`,
      'src/utils/cache.ts': `
const usersCache = new Map<string, unknown>();

export function cacheUsersPage(page: number, users: unknown[]) {
  const key = 'users:' + page + ':' + Date.now();
  usersCache.set(key, users);
  return users;
}

export function cacheSize() {
  return usersCache.size;
}
`,
      'src/telemetry.ts':
        'export const metric = (name: string, value: number) => ({ name, value });\n',
      'src/featureFlags.ts': 'export const isOn = (_flag: string) => true;\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadLikeCalls(logs);

      const touchedRoutes = logs.some((log) =>
        log.toolRequest.args.includes('routes.ts'),
      );
      const touchedCache = logs.some((log) =>
        log.toolRequest.args.includes('cache.ts'),
      );

      expect(
        readCalls.length,
        'Expected multi-file tracing reads for memory-leak diagnosis',
      ).toBeGreaterThanOrEqual(2);
      expect(
        touchedRoutes,
        'Expected agent to inspect the /api/users route',
      ).toBe(true);
      expect(touchedCache, 'Expected agent to reach src/utils/cache.ts').toBe(
        true,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'hardcoded db host discovery should use grep over broad reading',
    prompt: 'Find all places where we hardcode the database host.',
    files: {
      'src/config/db.ts':
        'export const dbConfig = { host: "db.internal.prod", port: 5432, ssl: true };\n',
      'scripts/migrate.ts':
        'const connectionString = "postgres://admin:secret@db.internal.prod:5432/app";\n',
      'src/config/index.ts':
        'export const mode = process.env.NODE_ENV || "development";\n',
      'src/config/redis.ts':
        'export const redisHost = process.env.REDIS_HOST || "redis";\n',
      'src/services/userService.ts':
        'export const findUser = (id: string) => ({ id });\n',
      'src/services/orderService.ts': 'export const listOrders = () => [];\n',
      'src/services/paymentService.ts':
        'export const charge = async () => ({ ok: true });\n',
      'src/db/pool.ts': 'export const pool = { query: async () => [] };\n',
      'src/db/query.ts': 'export const query = async (_sql: string) => [];\n',
      'src/db/seeds.ts': 'export const seed = async () => true;\n',
      'src/http/server.ts': 'export const start = () => true;\n',
      'README.md': '# Setup\nUse environment variables for hosts.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const grepCalls = logs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );
      const readCalls = getReadLikeCalls(logs);

      expect(
        grepCalls.length,
        'Expected grep for pinpointing hardcoded host usage',
      ).toBeGreaterThanOrEqual(1);
      expect(
        readCalls.length,
        'Expected focused reads rather than scanning entire tree',
      ).toBeLessThanOrEqual(4);
      expect(result).toMatch(/src\/config\/db\.ts|db\.ts/i);
      expect(result).toMatch(/scripts\/migrate\.ts|migrate\.ts/i);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'recently modified files should be answered using shell metadata',
    prompt: 'Which files were modified most recently?',
    files: {
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': 'export const b = 2;\n',
      'src/c.ts': 'export const c = 3;\n',
      'src/d.ts': 'export const d = 4;\n',
      'docs/notes.md': 'release notes\n',
      'package.json': JSON.stringify({
        name: 'recent-files',
        version: '1.0.0',
      }),
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const shellCalls = logs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );
      const readCalls = getReadLikeCalls(logs);

      const usedMetadataShellCommand = shellCalls.some((log) => {
        const command = getShellCommand(log);
        return (
          command.includes('ls -lt') ||
          command.includes('git log') ||
          command.includes('stat ')
        );
      });

      expect(
        shellCalls.length,
        'Expected shell usage for recency metadata queries',
      ).toBeGreaterThanOrEqual(1);
      expect(
        usedMetadataShellCommand,
        'Expected ls/git/stat style command for modified-time lookup',
      ).toBe(true);
      expect(
        readCalls.length,
        'Should not brute-force by reading many files',
      ).toBeLessThanOrEqual(2);
    },
  });
});
