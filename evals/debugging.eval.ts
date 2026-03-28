/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { evalTest, readFileOrFail } from './test-helper.js';
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

const TRACKED_TOOL_NAMES = new Set([
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
]);

const parseToolArgs = (rawArgs: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return { raw: rawArgs };
  } catch {
    return { raw: rawArgs };
  }
};

const getTrackedLogs = (rig: { readToolLogs: () => ToolLog[] }): ToolLog[] =>
  rig
    .readToolLogs()
    .filter((log) => TRACKED_TOOL_NAMES.has(log.toolRequest.name));

const getReadCalls = (logs: ToolLog[]) =>
  logs.filter((log) => READ_TOOL_NAMES.has(log.toolRequest.name));

const getEditCalls = (logs: ToolLog[]) =>
  logs.filter((log) => EDIT_TOOL_NAMES.has(log.toolRequest.name));

const readFileWithGuard = (
  rig: { testDir?: string | null; readFile: (fileName: string) => string },
  filePath: string,
  context: string,
): string => {
  expect(
    existsSync(join(rig.testDir ?? '', filePath)),
    `${context}: expected ${filePath} to exist, but it was missing (possibly renamed or moved).`,
  ).toBe(true);
  return readFileOrFail(rig, filePath);
};

describe('Debugging', () => {
  evalTest('USUALLY_PASSES', {
    name: 'stack trace misdirection should be fixed in caller not utility',
    prompt:
      'App throws TypeError: Cannot read properties of undefined (reading map) at utils.ts:12. Fix it.',
    files: {
      'src/utils.ts': `
type User = { id: number; name: string };

export function formatUsers(users: User[]) {
  return users.map((user) => ({
    id: user.id,
    displayName: user.name.toUpperCase(),
  }));
}
`,
      'src/routes.ts': `
import { formatUsers } from './utils.js';

export function getUsersHandler(req: { query: Record<string, string | undefined> }) {
  const includeIds = req.query['ids']?.split(',').map((id) => Number(id));
  const users = includeIds?.map((id) => ({ id, name: 'user-' + id }));
  return formatUsers(users as { id: number; name: string }[]);
}
`,
      'src/server.ts':
        'import { getUsersHandler } from "./routes.js";\nexport const handler = getUsersHandler;\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const editCalls = getEditCalls(logs);

      const readUtils = readCalls.some((log) =>
        log.toolRequest.args.includes('utils.ts'),
      );
      const readRoutes = readCalls.some((log) =>
        log.toolRequest.args.includes('routes.ts'),
      );

      const editedRoutes = editCalls.some((log) => {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        return (
          typeof filePath === 'string' && filePath.endsWith('src/routes.ts')
        );
      });
      const routesContent = readFileWithGuard(
        rig,
        'src/routes.ts',
        'Stack trace misdirection fix verification',
      );

      expect(readUtils, 'Expected read of utils.ts from stack trace').toBe(
        true,
      );
      expect(readRoutes, 'Expected trace into routes.ts call-site').toBe(true);
      expect(editedRoutes, 'Expected actual fix in routes.ts').toBe(true);
      expect(routesContent).toMatch(
        /\?\.|\?\?|if\s*\(!req\.query\['ids'\]\)|\|\|\s*\[\]/,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'stale profile data bug should be fixed by correct await ordering',
    prompt:
      'The user profile sometimes shows stale data even after updates. Fix it.',
    files: {
      'profile.ts': `
type Profile = { id: string; displayName: string };

const cache = new Map<string, Profile>();
const db = {
  async updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
    return { id: userId, displayName: patch.displayName || 'unknown' };
  },
};

export async function updateAndGetProfile(
  userId: string,
  patch: Partial<Profile>,
): Promise<Profile> {
  const cached = cache.get(userId);
  const pendingWrite = db.updateProfile(userId, patch);

  if (cached) {
    return cached;
  }

  const updated = await pendingWrite;
  cache.set(userId, updated);
  return updated;
}
`,
      'profile.test.ts':
        'import { updateAndGetProfile } from "./profile.js";\nexport const testFn = updateAndGetProfile;\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const editCalls = getEditCalls(logs);

      const readProfile = readCalls.some((log) =>
        log.toolRequest.args.includes('profile.ts'),
      );
      const editedProfile = editCalls.some((log) =>
        log.toolRequest.args.includes('profile.ts'),
      );
      const content = readFileWithGuard(
        rig,
        'profile.ts',
        'Stale profile fix verification',
      );

      expect(readProfile, 'Expected profile.ts to be inspected').toBe(true);
      expect(editedProfile, 'Expected profile.ts to be edited').toBe(true);
      expect(content).toMatch(/await\s+db\.updateProfile|await\s+pendingWrite/);
      expect(content).not.toMatch(/if\s*\(cached\)\s*{\s*return cached;/);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'ci-only config path failure should be traced to environment-specific loader',
    prompt:
      'Tests fail on CI with: Error: ENOENT: no such file or directory ./config/prod.json. All tests pass locally.',
    files: {
      'src/config/loadConfig.ts': `
import fs from 'node:fs';

export function loadConfig() {
  const env = process.env['NODE_ENV'] || 'development';
  const file = env === 'development' ? './config/dev.json' : './config/prod.json';
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
`,
      'config/dev.json': '{"apiBase":"http://localhost:3000"}\n',
      'config/ci.json': '{"apiBase":"http://ci.internal:3000"}\n',
      'tests/loadConfig.test.ts': `
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';

describe('config', () => {
  it('loads config', () => {
    expect(loadConfig()).toBeDefined();
  });
});
`,
      '.github/workflows/ci.yml':
        'name: ci\nsteps:\n  - run: NODE_ENV=test CI=true npm test\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const loaderInspected = logs.some((log) =>
        log.toolRequest.args.includes('loadConfig.ts'),
      );

      expect(
        loaderInspected,
        'Expected investigation of config loading code',
      ).toBe(true);
      expect(result).toMatch(
        /NODE_ENV|CI|prod\.json|config\/prod\.json|env-specific|ci\.json/i,
      );
      expect(
        getReadCalls(logs).length,
        'Expected active local diagnosis, not guessing',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should trace async race condition across Promise chain',
    prompt:
      'Users see stale data after updates. The logs show saveActivity completes before processUser sometimes. Find and fix the race condition.',
    files: {
      'src/db.ts': `
export type UserRecord = { id: string; name: string; version: number };

const users = new Map<string, UserRecord>([['u1', { id: 'u1', name: 'Asha', version: 1 }]]);

export const db = {
  async getUser(userId: string): Promise<UserRecord> {
    return users.get(userId) ?? { id: userId, name: 'unknown', version: 0 };
  },
  async updateUser(userId: string, next: UserRecord): Promise<void> {
    users.set(userId, next);
  },
  async insertActivity(input: { userId: string; snapshotVersion: number; event: string }): Promise<void> {
    void input;
  },
};
`,
      'src/fetchUser.ts': `
import { db } from './db.js';

export async function fetchUser(userId: string) {
  return db.getUser(userId);
}
`,
      'src/saveActivity.ts': `
import { fetchUser } from './fetchUser.js';
import { db } from './db.js';

export async function saveActivity(userId: string, event: string) {
  const snapshot = await fetchUser(userId);
  await db.insertActivity({
    userId,
    snapshotVersion: snapshot.version,
    event,
  });
}
`,
      'src/processUser.ts': `
import { fetchUser } from './fetchUser.js';
import { db } from './db.js';
import { saveActivity } from './saveActivity.js';

export async function processUser(userId: string, newName: string) {
  const current = await fetchUser(userId);
  const next = {
    ...current,
    name: newName,
    version: current.version + 1,
  };

  const updatePromise = db.updateUser(userId, next);
  saveActivity(userId, 'user-updated'); // race condition: saveActivity may read stale user before update settles
  await updatePromise;

  return next;
}
`,
      'src/index.ts':
        'export { processUser } from "./processUser.js";\nexport { saveActivity } from "./saveActivity.js";\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const editCalls = getEditCalls(logs);

      const readFetchUser = readCalls.some((log) =>
        log.toolRequest.args.includes('fetchUser.ts'),
      );
      const readProcessUser = readCalls.some((log) =>
        log.toolRequest.args.includes('processUser.ts'),
      );
      const readSaveActivity = readCalls.some((log) =>
        log.toolRequest.args.includes('saveActivity.ts'),
      );

      const editedRaceFlow = editCalls.some((log) =>
        /processUser\.ts|saveActivity\.ts/i.test(log.toolRequest.args),
      );
      const processUserContent = readFileWithGuard(
        rig,
        'src/processUser.ts',
        'Async race condition fix verification',
      );

      expect(
        readFetchUser && readProcessUser && readSaveActivity,
        'Expected tracing across fetchUser, processUser, and saveActivity before fixing race condition',
      ).toBe(true);
      expect(
        editedRaceFlow,
        'Expected edits in processUser.ts or saveActivity.ts to resolve race',
      ).toBe(true);
      expect(processUserContent).toMatch(/Promise\.all|await\s+saveActivity/);
      expect(processUserContent).not.toMatch(
        /race condition: saveActivity may read stale user before update settles/i,
      );

      if (
        processUserContent.includes('await saveActivity') &&
        !processUserContent.includes('Promise.all')
      ) {
        expect(processUserContent).toMatch(
          /await\s+updatePromise[\s\S]{0,220}await\s+saveActivity/,
        );
      }
    },
  });
});
