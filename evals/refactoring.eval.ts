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

describe('Refactoring', () => {
  evalTest('USUALLY_PASSES', {
    name: 'duplicate email validation should be consolidated into shared utility',
    prompt:
      'The email validation logic is duplicated across these three service files. Consolidate it.',
    files: {
      'src/services/userService.ts': `
export function createUser(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    throw new Error('invalid email for user');
  }
  return { id: 'u-1', email };
}
`,
      'src/services/orderService.ts': `
export function assignOrderEmail(orderId: string, email: string) {
  const looksValid = email.includes('@');
  if (!looksValid) {
    throw new Error('order contact email is invalid');
  }
  return { orderId, email };
}
`,
      'src/services/newsletterService.ts': `
export function subscribe(email: string) {
  const pattern = /^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/;
  if (!pattern.test(email)) {
    throw new Error('cannot subscribe invalid email');
  }
  return { email, subscribed: true };
}
`,
      'src/index.ts':
        'export { createUser } from "./services/userService.js";\nexport { subscribe } from "./services/newsletterService.js";\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const editCalls = getEditCalls(logs);

      const touchedAllServices = [
        'userService.ts',
        'orderService.ts',
        'newsletterService.ts',
      ].every((file) =>
        readCalls.some((log) => log.toolRequest.args.includes(file)),
      );

      const validationUtil = rig.readFile('src/utils/validation.ts');
      const userService = rig.readFile('src/services/userService.ts');
      const orderService = rig.readFile('src/services/orderService.ts');
      const newsletterService = rig.readFile(
        'src/services/newsletterService.ts',
      );

      expect(
        touchedAllServices,
        'Expected reads across all duplicate validation call-sites',
      ).toBe(true);
      expect(
        editCalls.length,
        'Expected edits across utility and service files',
      ).toBeGreaterThanOrEqual(3);
      expect(validationUtil).toMatch(/email|valid/i);
      expect(userService).toMatch(/validation|isValidEmail/i);
      expect(orderService).toMatch(/validation|isValidEmail/i);
      expect(newsletterService).toMatch(/validation|isValidEmail/i);
      expect(userService).not.toMatch(/emailRegex|\^[^/]+\$|includes\('@'\)/);
      expect(orderService).not.toMatch(/emailRegex|\^[^/]+\$|includes\('@'\)/);
      expect(newsletterService).not.toMatch(
        /emailRegex|\^[^/]+\$|includes\('@'\)/,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'retry logic should be extracted into shared utility used by both clients',
    prompt:
      'Extract the retry logic from apiClient.ts and httpClient.ts into a shared utility.',
    files: {
      'src/apiClient.ts': `
export async function fetchAccount(id: string) {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return { id, ok: true, source: 'api' };
    } catch (error) {
      lastError = error as Error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  throw lastError;
}
`,
      'src/httpClient.ts': `
export async function requestJson(path: string) {
  let retries = 0;
  while (retries < 5) {
    try {
      return { path, ok: true, source: 'http' };
    } catch (error) {
      retries += 1;
      await new Promise((resolve) => setTimeout(resolve, 50 * retries * retries));
      if (retries >= 5) {
        throw error;
      }
    }
  }
  throw new Error('unreachable');
}
`,
      'src/index.ts':
        'export { fetchAccount } from "./apiClient.js";\nexport { requestJson } from "./httpClient.js";\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const writeCalls = logs.filter(
        (log) => log.toolRequest.name === WRITE_FILE_TOOL_NAME,
      );
      const readCalls = getReadCalls(logs);

      const newRetryFilePath = writeCalls
        .map((log) => {
          const args = parseToolArgs(log.toolRequest.args);
          const filePath = args['file_path'];
          return typeof filePath === 'string' ? filePath : '';
        })
        .find(
          (filePath) =>
            filePath.length > 0 &&
            !filePath.endsWith('src/apiClient.ts') &&
            !filePath.endsWith('src/httpClient.ts') &&
            filePath.toLowerCase().includes('retry'),
        );

      const apiClient = rig.readFile('src/apiClient.ts');
      const httpClient = rig.readFile('src/httpClient.ts');
      const webCalls = logs.filter((log) =>
        WEB_TOOL_NAMES.has(log.toolRequest.name),
      );

      expect(
        readCalls.length,
        'Expected source inspection before refactoring',
      ).toBeGreaterThanOrEqual(2);
      expect(
        newRetryFilePath,
        'Expected a new shared retry utility file to be created',
      ).toBeDefined();
      expect(apiClient).toMatch(/retry|from ['"].*retry/i);
      expect(httpClient).toMatch(/retry|from ['"].*retry/i);
      expect(webCalls.length, 'Refactoring should not require web tools').toBe(
        0,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'monolith class responsibilities should be split into separate modules',
    prompt: 'This class has too many responsibilities. Split it.',
    files: {
      'src/monolith.ts': `
type User = { id: string; token: string };
type Product = { id: string; name: string };

export class CommerceGateway {
  private cache = new Map<string, Product[]>();

  async authenticate(token: string): Promise<User> {
    if (!token || token.length < 10) {
      throw new Error('invalid token');
    }
    return { id: 'u-1', token };
  }

  async fetchProducts(category: string): Promise<Product[]> {
    return [
      { id: 'p-1', name: category + '-a' },
      { id: 'p-2', name: category + '-b' },
    ];
  }

  async getProductsForUser(token: string, category: string): Promise<Product[]> {
    await this.authenticate(token);

    if (this.cache.has(category)) {
      return this.cache.get(category)!;
    }

    const products = await this.fetchProducts(category);
    this.cache.set(category, products);
    return products;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
`,
      'src/index.ts': 'export { CommerceGateway } from "./monolith.js";\n',
    },
    assert: async (rig) => {
      const logs = getTrackedLogs(rig);
      const writeCalls = logs.filter(
        (log) => log.toolRequest.name === WRITE_FILE_TOOL_NAME,
      );
      const grepCalls = logs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );
      const shellCalls = logs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );

      const newFiles = writeCalls
        .map((log) => {
          const args = parseToolArgs(log.toolRequest.args);
          const filePath = args['file_path'];
          return typeof filePath === 'string' ? filePath : '';
        })
        .filter(
          (filePath) =>
            filePath.length > 0 && !filePath.endsWith('src/monolith.ts'),
        );

      const uniqueNewFiles = new Set(newFiles);
      const monolith = rig.readFile('src/monolith.ts');

      expect(
        uniqueNewFiles.size,
        'Expected at least two new modules after split',
      ).toBeGreaterThanOrEqual(2);
      expect(monolith).toMatch(
        /from ['"].*auth|from ['"].*cache|from ['"].*fetch/i,
      );
      expect(
        grepCalls.length + shellCalls.length,
        'Expected at least lightweight project navigation',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
