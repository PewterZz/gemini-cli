/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

const getTouchedFilePaths = (logs: ToolLog[]): string[] =>
  logs
    .filter((log) => EDIT_TOOL_NAMES.has(log.toolRequest.name))
    .map((log) => {
      const args = parseToolArgs(log.toolRequest.args);
      const filePath = args['file_path'];
      return typeof filePath === 'string' ? filePath : '';
    })
    .filter((filePath) => filePath.length > 0);

const readFileWithGuard = (
  rig: { testDir?: string | null; readFile: (fileName: string) => string },
  filePath: string,
  context: string,
): string => {
  expect(
    existsSync(join(rig.testDir ?? '', filePath)),
    `${context}: expected ${filePath} to exist, but it was missing (possibly renamed or moved).`,
  ).toBe(true);
  return rig.readFile(filePath);
};

describe('Refactoring', () => {
  evalTest('USUALLY_PASSES', {
    name: 'duplicate email validation should be consolidated into shared utility',
    timeout: 180000,
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
      const touchedFilePaths = getTouchedFilePaths(logs);
      const serviceFiles = [
        'src/services/userService.ts',
        'src/services/orderService.ts',
        'src/services/newsletterService.ts',
      ];

      const touchedAllServices = [
        'userService.ts',
        'orderService.ts',
        'newsletterService.ts',
      ].every((file) =>
        readCalls.some((log) => log.toolRequest.args.includes(file)),
      );

      const sharedValidationPath = touchedFilePaths.find(
        (filePath) =>
          !serviceFiles.some((serviceFile) => filePath.endsWith(serviceFile)) &&
          /(validation|valid|email)/i.test(filePath),
      );

      const userService = readFileWithGuard(
        rig,
        'src/services/userService.ts',
        'Email validation consolidation verification',
      );
      const orderService = readFileWithGuard(
        rig,
        'src/services/orderService.ts',
        'Email validation consolidation verification',
      );
      const newsletterService = readFileWithGuard(
        rig,
        'src/services/newsletterService.ts',
        'Email validation consolidation verification',
      );

      if (sharedValidationPath) {
        const validationUtil = readFileWithGuard(
          rig,
          sharedValidationPath,
          'Email validation consolidation verification',
        );
        expect(validationUtil).toMatch(/email|valid/i);
      }

      const sharedValidationUsageCount = [
        userService,
        orderService,
        newsletterService,
      ].filter((content) =>
        /from ['"].*(validation|valid|email)|\b(isValidEmail|validateEmail|assertValidEmail|isEmailValid)\b/i.test(
          content,
        ),
      ).length;
      const inlineValidationPatternCount = [
        userService,
        orderService,
        newsletterService,
      ].filter((content) =>
        /includes\('@'\)|emailRegex|pattern\s*=|\/\^[^\n/]*@[^\n/]*\//i.test(
          content,
        ),
      ).length;

      expect(
        touchedAllServices,
        'Expected reads across all duplicate validation call-sites',
      ).toBe(true);
      expect(
        editCalls.length,
        'Expected edits across utility and service files',
      ).toBeGreaterThanOrEqual(3);
      expect(
        sharedValidationPath,
        'Expected at least one shared validation utility file outside the original services',
      ).toBeDefined();
      expect(
        sharedValidationUsageCount,
        'Expected services to call a shared validation helper after refactor',
      ).toBeGreaterThanOrEqual(2);
      expect(
        inlineValidationPatternCount,
        'Expected duplicate inline validators to be mostly removed from service files',
      ).toBeLessThanOrEqual(1);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'retry logic should be extracted into shared utility used by both clients',
    timeout: 180000,
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
      const touchedFilePaths = getTouchedFilePaths(logs);
      const touchedApiClient = touchedFilePaths.some((filePath) =>
        filePath.endsWith('src/apiClient.ts'),
      );
      const touchedHttpClient = touchedFilePaths.some((filePath) =>
        filePath.endsWith('src/httpClient.ts'),
      );
      const sharedRetryPath = touchedFilePaths.find(
        (filePath) =>
          !filePath.endsWith('src/apiClient.ts') &&
          !filePath.endsWith('src/httpClient.ts') &&
          /(retry|backoff|resilien|shared|util)/i.test(filePath),
      );
      const apiClient = readFileWithGuard(
        rig,
        'src/apiClient.ts',
        'Retry extraction verification',
      );
      const httpClient = readFileWithGuard(
        rig,
        'src/httpClient.ts',
        'Retry extraction verification',
      );

      if (sharedRetryPath) {
        const sharedRetryUtility = readFileWithGuard(
          rig,
          sharedRetryPath,
          'Retry extraction verification',
        );
        expect(sharedRetryUtility).toMatch(/retry|attempt|backoff|delay/i);
      }

      expect(touchedApiClient, 'Expected apiClient.ts to be refactored').toBe(
        true,
      );
      expect(touchedHttpClient, 'Expected httpClient.ts to be refactored').toBe(
        true,
      );
      expect(
        sharedRetryPath,
        'Expected a shared retry/backoff utility file to be created',
      ).toBeDefined();
      expect(apiClient).toMatch(
        /from ['"].*(retry|backoff|util)|withRetry|retry/i,
      );
      expect(httpClient).toMatch(
        /from ['"].*(retry|backoff|util)|withRetry|retry/i,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'monolith class responsibilities should be split into separate modules',
    timeout: 180000,
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
      const monolithPath = join(rig.testDir ?? '', 'src/monolith.ts');
      const monolithExists = existsSync(monolithPath);

      expect(
        uniqueNewFiles.size,
        'Expected at least two new modules after split',
      ).toBeGreaterThanOrEqual(2);

      if (monolithExists) {
        const monolith = rig.readFile('src/monolith.ts');
        expect(monolith).toMatch(
          /from ['"].*auth|from ['"].*cache|from ['"].*fetch|new\s+(Auth|Cache|Product|Gateway)/i,
        );
      } else {
        const indexContent = readFileWithGuard(
          rig,
          'src/index.ts',
          'Monolith split verification',
        );
        expect(indexContent).toMatch(
          /from ['"].*(auth|cache|fetch|gateway|service)/i,
        );
      }
    },
  });
});
