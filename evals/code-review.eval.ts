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

const getTrackedLogs = (rig: { readToolLogs: () => ToolLog[] }): ToolLog[] =>
  rig.readToolLogs();

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

describe('Code Review', () => {
  evalTest('USUALLY_PASSES', {
    name: 'payment review should ignore red herrings and fix off-by-one pagination bug',
    prompt:
      'Review the payment processing logic in these files and find any bugs. Fix the real bug you find.',
    files: {
      'payments.ts': `
type Payment = { id: string; amount: number };

export function paginatePayments(items: Payment[], pageSize: number): Payment[][] {
  const pages: Payment[][] = [];
  for (let i = 0; i <= items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

export function totalAmount(items: Payment[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}
`,
      'validators.ts': `
export function isValidCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export function hasValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount >= 0;
}
`,
      'db.ts': `
export async function fetchPayments(accountId: string, limit: number, offset: number) {
  const query = {
    text: 'SELECT id, amount FROM payments WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    values: [accountId, limit, offset],
  };
  return query;
}
`,
      'README.md':
        '# Payments\nPagination should not return empty trailing pages.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const payments = readFileWithGuard(
        rig,
        'payments.ts',
        'Pagination bug verification',
      );

      expect(
        readCalls.length,
        'Expected review across multiple files',
      ).toBeGreaterThanOrEqual(2);
      expect(result).toMatch(
        /off[- ]by[- ]one|i <= items\.length|extra empty page|pagination/i,
      );
      expect(payments).not.toContain('i <= items.length');
      expect(payments).toMatch(/i\s*<\s*items\.length/);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'order race condition fix should inspect order and inventory before editing',
    prompt:
      'We have a race condition somewhere in the order system. Can you find and fix it?',
    files: {
      'order.ts': `
import { withOrderLock } from './locks.js';
import { reserveStock } from './inventory.js';

const ordersTable = {
  async get(id: string) {
    return { id, status: 'pending' as const };
  },
  async update(id: string, patch: Record<string, string>) {
    return { id, ...patch };
  },
};

export async function finalizeOrder(orderId: string, sku: string, qty: number) {
  const latest = await ordersTable.get(orderId);
  if (latest.status !== 'pending') {
    throw new Error('order already finalized');
  }

  await reserveStock(sku, qty);
  return ordersTable.update(orderId, { status: 'paid' });
}
`,
      'inventory.ts': `
const stock = new Map<string, number>([['SKU-1', 20]]);

export async function reserveStock(sku: string, qty: number) {
  const current = stock.get(sku) ?? 0;
  if (current < qty) {
    throw new Error('insufficient stock');
  }
  stock.set(sku, current - qty);
}
`,
      'locks.ts': `
const inFlight = new Map<string, Promise<unknown>>();

export async function withOrderLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  const previous = inFlight.get(orderId);
  if (previous) {
    await previous;
  }
  const current = fn();
  inFlight.set(orderId, current);
  try {
    return await current;
  } finally {
    inFlight.delete(orderId);
  }
}
`,
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const editCalls = getEditCalls(logs);

      const inspectedOrderFlow = logs.some((log) =>
        /order\.ts|inventory\.ts|locks\.ts/i.test(log.toolRequest.args),
      );
      const orderContent = readFileWithGuard(
        rig,
        'order.ts',
        'Race condition fix verification',
      );

      expect(
        readCalls.length,
        'Expected multi-file review before race-condition fix',
      ).toBeGreaterThanOrEqual(2);
      expect(
        inspectedOrderFlow,
        'Expected investigation to include order/inventory/locking flow',
      ).toBe(true);
      expect(
        editCalls.length,
        'Expected at least one edit while fixing race condition',
      ).toBeGreaterThanOrEqual(1);
      expect(
        /withOrderLock\s*\(/.test(orderContent),
        'Expected final implementation to coordinate writes through a lock/transaction mechanism',
      ).toBe(true);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'api route review should identify silent error swallowing',
    prompt:
      'Is there anything wrong with how we handle errors in the API routes?',
    files: {
      'routes.ts': `
export async function getUserRoute(req: { params: { id: string } }, res: { json: (arg: unknown) => void }) {
  try {
    const user = await Promise.resolve({ id: req.params.id, name: 'Tess' });
    res.json({ ok: true, user });
  } catch {
    // intentionally blank
  }
}
`,
      'middleware.ts': `
export function requestLogger(path: string) {
  return '[request] ' + path;
}
`,
      'app.ts': 'export { getUserRoute } from "./routes.js";\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const routesWasRead = readCalls.some((log) =>
        log.toolRequest.args.includes('routes.ts'),
      );

      expect(routesWasRead, 'Expected the agent to inspect routes.ts').toBe(
        true,
      );
      expect(result).toMatch(
        /silent|swallow|ignored|empty catch|log|re-throw|rethrow/i,
      );
      expect(
        readCalls.length,
        'Expected at least lightweight local inspection before judging error handling',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'review should flag subtle query and object-merge security risks',
    prompt: 'Review this code',
    files: {
      'db/query-builder.ts': `
type SortDirection = 'asc' | 'desc';

export function buildUserListQuery(sortField: string, direction: SortDirection) {
  const normalizedDirection = direction === 'desc' ? 'DESC' : 'ASC';
  return \`SELECT id, email FROM users ORDER BY \${sortField} \${normalizedDirection} LIMIT 50\`;
}
`,
      'config/preferences.ts': `
type Preferences = Record<string, unknown>;

export function mergeUserPreferences(defaults: Preferences, incoming: Preferences) {
  return Object.assign({}, defaults, incoming);
}
`,
      'app.ts': `
import { buildUserListQuery } from './db/query-builder.js';
import { mergeUserPreferences } from './config/preferences.js';

export function preview(sortField: string, direction: 'asc' | 'desc', prefs: Record<string, unknown>) {
  return {
    query: buildUserListQuery(sortField, direction),
    merged: mergeUserPreferences({ theme: 'light' }, prefs),
  };
}
`,
    },
    assert: async (rig, result) => {
      const readCalls = getReadCalls(getTrackedLogs(rig));
      expect(readCalls.length).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(/sql injection|prototype pollution/i);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'review should catch N+1 query hidden behind a helper function',
    prompt: 'Review the user list endpoint for performance issues.',
    files: {
      'userService.ts': `
import { getUser } from './helpers.js';

export async function buildUserList(ids: string[]) {
  const users = [];
  for (const id of ids) {
    users.push(await getUser(id));
  }
  return users;
}
`,
      'helpers.ts': `
const db = {
  async query(sql: string, values: unknown[]) {
    return { id: values[0], name: 'user-' + values[0], sql };
  },
};

export async function getUser(id: string) {
  return db.query('SELECT id, name FROM users WHERE id = $1', [id]);
}
`,
      'routes/users.ts': `
import { buildUserList } from '../userService.js';

export async function usersRoute() {
  return buildUserList(['u1', 'u2', 'u3', 'u4']);
}
`,
    },
    assert: async (rig, result) => {
      const readCalls = getReadCalls(getTrackedLogs(rig));
      const readUserService = readCalls.some((log) =>
        log.toolRequest.args.includes('userService.ts'),
      );
      const readHelpers = readCalls.some((log) =>
        log.toolRequest.args.includes('helpers.ts'),
      );

      expect(
        readUserService,
        'Expected review to inspect userService.ts loop logic',
      ).toBe(true);
      expect(
        readHelpers,
        'Expected review to inspect helpers.ts where DB call is hidden',
      ).toBe(true);
      expect(result).toMatch(
        /n\+1|batch|batching|batched|single query|\bin\s*\(/i,
      );
    },
  });
});
