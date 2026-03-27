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
      const webCalls = logs.filter((log) =>
        WEB_TOOL_NAMES.has(log.toolRequest.name),
      );
      const payments = rig.readFile('payments.ts');

      expect(
        readCalls.length,
        'Expected review across multiple files',
      ).toBeGreaterThanOrEqual(2);
      expect(result).toMatch(
        /off[- ]by[- ]one|i <= items\.length|extra empty page|pagination/i,
      );
      expect(payments).not.toContain('i <= items.length');
      expect(payments).toMatch(/i\s*<\s*items\.length/);
      expect(webCalls.length, 'This review should remain local').toBe(0);
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
      const readFileCalls = logs.filter(
        (log) => log.toolRequest.name === READ_FILE_TOOL_NAME,
      );
      const editCalls = getEditCalls(logs);

      const readOrder = readFileCalls.some((log) => {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        return typeof filePath === 'string' && filePath.endsWith('order.ts');
      });
      const readInventory = readFileCalls.some((log) => {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        return (
          typeof filePath === 'string' && filePath.endsWith('inventory.ts')
        );
      });

      const orderContent = rig.readFile('order.ts');

      expect(readOrder, 'Expected read_file usage for order.ts').toBe(true);
      expect(readInventory, 'Expected read_file usage for inventory.ts').toBe(
        true,
      );
      expect(
        editCalls.length,
        'Expected at least one edit while fixing race condition',
      ).toBeGreaterThanOrEqual(1);
      expect(orderContent).toMatch(
        /withOrderLock|lock|transaction|compareAndSwap/i,
      );
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
      const grepCalls = logs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );

      expect(routesWasRead, 'Expected the agent to inspect routes.ts').toBe(
        true,
      );
      expect(result).toMatch(
        /silent|swallow|ignored|empty catch|log|re-throw|rethrow/i,
      );
      expect(
        grepCalls.length,
        'Expected at least basic code discovery before judging',
      ).toBeGreaterThanOrEqual(0);
    },
  });
});
