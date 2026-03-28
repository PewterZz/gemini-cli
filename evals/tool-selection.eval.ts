/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
import {
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
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

const getTrackedLogs = (rig: { readToolLogs: () => ToolLog[] }): ToolLog[] =>
  rig.readToolLogs();

const getReadLikeCalls = (logs: ToolLog[]): ToolLog[] =>
  logs.filter((log) => READ_TOOL_NAMES.has(log.toolRequest.name));

const getEditCalls = (logs: ToolLog[]): ToolLog[] =>
  logs.filter((log) => EDIT_TOOL_NAMES.has(log.toolRequest.name));

describe('Tool Selection', () => {
  evalTest('USUALLY_PASSES', {
    name: 'ci failure with local pass should trigger env-pattern search',
    prompt:
      'The CI pipeline is failing but all tests pass locally. Help me understand why.',
    files: {
      '.env':
        'NODE_ENV=development\nDB_HOST=localhost\nPAYMENTS_ENDPOINT=http://localhost:4100\n',
      '.env.ci': 'NODE_ENV=test\nDB_HOST=postgres-ci\n',
      'src/config.ts': `
import fs from 'node:fs';

export function loadConfig() {
  const envFile = process.env['CI'] ? '.env.ci' : '.env';
  const raw = fs.readFileSync(envFile, 'utf8');
  return Object.fromEntries(raw.split(/\n/).filter(Boolean).map((line) => line.split('=')));
}
`,
      'src/api.ts': `
import { loadConfig } from './config.js';

export function getPaymentsEndpoint() {
  const cfg = loadConfig();
  return cfg['PAYMENTS_ENDPOINT'] || 'http://localhost:4100';
}
`,
      'README.md': '# Project\nRun tests with \`npm test\`.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadLikeCalls(logs);
      const editCalls = getEditCalls(logs);
      const touchedEnvOrConfig = logs.some((log) =>
        /\.env(\.ci)?|config\.ts|api\.ts/i.test(log.toolRequest.args),
      );

      expect(
        readCalls.length + editCalls.length,
        'Expected concrete repo inspection before proposing a CI/local explanation',
      ).toBeGreaterThanOrEqual(1);
      expect(
        touchedEnvOrConfig,
        'Expected investigation of environment/config related files',
      ).toBe(true);
      expect(result).toMatch(
        /ci|local|env|environment|payments_endpoint|\.env\.ci/i,
      );
      expect(result).toMatch(
        /missing|different|mismatch|fallback|localhost|ci\.internal|not set/i,
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
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadLikeCalls(logs);
      const inspectedUsersFlow = logs.some((log) =>
        /routes\.ts|cache\.ts|users/i.test(log.toolRequest.args),
      );

      expect(
        readCalls.length,
        'Expected multi-file tracing reads for memory-leak diagnosis',
      ).toBeGreaterThanOrEqual(2);
      expect(
        inspectedUsersFlow,
        'Expected investigation of the users request path and cache flow',
      ).toBe(true);
      expect(result).toMatch(/memory|leak|heap|cache|map|users/i);
      expect(result).toMatch(/date\.now|unbounded|growing|key|ttl|evict/i);
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
      const readCalls = getReadLikeCalls(logs);
      const mentionsConfigPath =
        /src\/config\/db\.ts|config\/db\.ts|\bdb\.ts\b/i.test(result);
      const mentionsMigratePath = /scripts\/migrate\.ts|\bmigrate\.ts\b/i.test(
        result,
      );
      const mentionsBothLocationsSummary = /\b(two|2|both|multiple)\b/i.test(
        result,
      );

      expect(
        readCalls.length,
        'Expected at least minimal local inspection for host discovery',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(
        /db\.internal\.prod|postgres:\/\/admin:secret@db\.internal\.prod/i,
      );
      expect(
        mentionsConfigPath || mentionsMigratePath,
        'Expected concrete location hints or file references in the answer',
      ).toBe(true);
      expect(
        (mentionsConfigPath && mentionsMigratePath) ||
          mentionsBothLocationsSummary,
        'Expected the response to communicate there are multiple hardcoded host locations',
      ).toBe(true);
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
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadLikeCalls(logs);
      const recencyLanguage =
        /recent|recently|modified|newest|latest|mtime|timestamp/i.test(result);
      const mentionedFiles = [
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
        'src/d.ts',
        'docs/notes.md',
      ].filter(
        (filePath) =>
          result.includes(filePath) ||
          result.includes(filePath.split('/').at(-1) ?? ''),
      );

      expect(
        recencyLanguage,
        'Expected the answer to discuss file recency or modification time',
      ).toBe(true);
      expect(
        mentionedFiles.length,
        'Expected at least one concrete file reference in recency results',
      ).toBeGreaterThanOrEqual(1);
      expect(
        readCalls.length,
        'Should not brute-force by reading many files',
      ).toBeLessThanOrEqual(4);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should diagnose why tests pass locally but fail in CI with environment differences',
    prompt:
      'Tests pass locally but fail in CI with connection refused. Help me understand why.',
    files: {
      'tests/db.integration.test.ts': `
import { connect } from '../src/db.js';

export async function runDbTest() {
  const client = await connect();
  return client.ping();
}
`,
      '.env.local':
        'DB_URL=postgres://localhost:5432/app_local\nAPI_KEY=local-key\n',
      '.env.ci': 'API_KEY=ci-key\nNODE_ENV=test\n',
      'src/db.ts': `
type Client = { ping: () => string; url: string };

export async function connect(): Promise<Client> {
  const url = process.env['DB_URL'];
  if (!url) {
    throw new Error('connection refused: missing DB_URL');
  }
  return {
    url,
    ping: () => 'ok',
  };
}
`,
      'README.md':
        '# Testing\nLocal tests load .env.local and CI loads .env.ci.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadLikeCalls(logs);

      const readTestFile = readCalls.some((log) =>
        log.toolRequest.args.includes('tests/db.integration.test.ts'),
      );
      const readDbConfig = readCalls.some((log) =>
        log.toolRequest.args.includes('src/db.ts'),
      );
      const readCiEnv = readCalls.some((log) =>
        log.toolRequest.args.includes('.env.ci'),
      );

      expect(
        readTestFile && readDbConfig && readCiEnv,
        'Expected tracing from failing test to src/db.ts and CI environment file',
      ).toBe(true);
      expect(result).toMatch(/DB_URL|connection string|database url/i);
      expect(result).toMatch(
        /ci|local|missing|unset|fallback|connection refused/i,
      );
    },
  });
});
