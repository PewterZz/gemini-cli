/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';

describe('Large Codebase Navigation', () => {
  /**
   * In a large project with many files, the agent should use search tools
   * to find the relevant file rather than reading everything.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use search to find the right file in a large project',
    prompt:
      'Find where the database connection is configured and show me the connection string.',
    files: Object.fromEntries([
      ...Array.from({ length: 20 }, (_, i) => [
        `src/module${i}.ts`,
        `export const module${i} = { id: ${i} };\n`,
      ]),
      [
        'src/services/auth.ts',
        'export function authenticate(token: string) { return true; }\n',
      ],
      [
        'src/services/logger.ts',
        'export function log(msg: string) { console.log(msg); }\n',
      ],
      ['src/services/cache.ts', 'export const cache = new Map();\n'],
      [
        'src/config/database.ts',
        `
export const dbConfig = {
  connectionString: 'postgresql://localhost:5432/myapp',
  poolSize: 10,
  timeout: 5000,
};
`,
      ],
      [
        'src/config/userController.ts',
        `
export const userControllerConfig = {
  connectionString: 'postgresql://localhost:5432/decoy_controller',
  retries: 1,
};
`,
      ],
      [
        'src/config/userModel.ts',
        `
export const userModelConfig = {
  connectionString: 'postgresql://localhost:5432/decoy_model',
  strict: true,
};
`,
      ],
      [
        'src/config/userHelper.ts',
        `
export const userHelperConfig = {
  connectionString: 'postgresql://localhost:5432/decoy_helper',
  cache: true,
};
`,
      ],
      ['src/config/app.ts', 'export const port = 3000;\n'],
      ['package.json', '{"name": "large-app", "type": "module"}'],
    ]),
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();

      // Agent must use search tools and avoid reading every file
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      const searchCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'glob',
      );

      expect(
        searchCalls.length,
        'Expected agent to use grep_search or glob to locate the right file',
      ).toBeGreaterThanOrEqual(1);
      expect(
        readCalls.length,
        `Expected strategic reading (<=3 files), but read ${readCalls.length}`,
      ).toBeLessThanOrEqual(3);

      expect(result).toContain('postgresql://localhost:5432/myapp');
      expect(result).not.toContain('decoy_controller');
      expect(result).not.toContain('decoy_model');
      expect(result).not.toContain('decoy_helper');
    },
  });

  /**
   * When asked to find all uses of a function across a large codebase,
   * the agent should use grep_search rather than reading every file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep to find all usages of a function across many files',
    prompt:
      'Find all places in this codebase that call the authenticate() function. Return file paths only.',
    files: Object.fromEntries([
      ...Array.from({ length: 15 }, (_, i) => [
        `src/routes/route${i}.ts`,
        `export function handle${i}() { return ${i}; }\n`,
      ]),
      [
        'src/routes/authenticatedRoute.ts',
        'import { authenticate } from "../auth.js";\nexport function handleAuth(token: string) { return authenticate(token); }\n',
      ],
      [
        'src/routes/adminRoute.ts',
        'import { authenticate } from "../auth.js";\nexport function handleAdmin(token: string) { return authenticate(token); }\n',
      ],
      [
        'src/routes/commentOnly.ts',
        '// authenticate("legacy-token");\nexport function commentOnly() { return true; }\n',
      ],
      [
        'src/auth.ts',
        'export function authenticate(token: string) { return !!token; }\n',
      ],
      [
        'src/middleware.ts',
        'import { authenticate } from "./auth.js";\nexport function authMiddleware(req: any) { return authenticate(req.token); }\n',
      ],
      ['package.json', '{"name": "app", "type": "module"}'],
    ]),
    assert: async (rig, result) => {
      const toolLogs = rig.readToolLogs();
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'grep_search',
      );
      expect(
        grepCalls.length,
        'Expected agent to use grep_search to find function usages',
      ).toBeGreaterThanOrEqual(1);

      expect(result).toContain('authenticatedRoute.ts');
      expect(result).toContain('adminRoute.ts');
      expect(result).toContain('middleware.ts');
      expect(result).not.toContain('commentOnly.ts');
    },
  });

  /**
   * When asked to understand the architecture of an unfamiliar codebase,
   * the agent should explore structure before diving into files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should explore project structure before reading individual files',
    prompt: 'Give me an overview of how this project is structured.',
    files: Object.fromEntries([
      ['src/api/routes/users.ts', 'export const usersRouter = {};\n'],
      ['src/api/routes/orders.ts', 'export const ordersRouter = {};\n'],
      ['src/core/services/payment.ts', 'export function processPayment() {}\n'],
      ['src/core/services/email.ts', 'export function sendEmail() {}\n'],
      [
        'src/core/models/user.ts',
        'export interface User { id: number; name: string; }\n',
      ],
      [
        'src/core/models/order.ts',
        'export interface Order { id: number; total: number; }\n',
      ],
      [
        'src/db/migrations/001_init.sql',
        'CREATE TABLE users (id INT PRIMARY KEY, name TEXT);\n',
      ],
      [
        'src/db/migrations/002_add_orders.sql',
        'CREATE TABLE orders (id INT PRIMARY KEY, total INT);\n',
      ],
      ['src/utils/logger.ts', 'export const logger = console;\n'],
      ['src/utils/validator.ts', 'export function validate() {}\n'],
      [
        'src/index.ts',
        'import "./api/routes/users.js"; import "./api/routes/orders.js";\n',
      ],
      ['package.json', '{"name": "ecommerce-app", "type": "module"}'],
      ['README.md', '# E-commerce App\n'],
    ]),
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent should use directory listing or glob before reading files
      const discoveryCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'list_directory' ||
          log.toolRequest.name === 'glob',
      );
      expect(
        discoveryCalls.length,
        'Expected agent to explore directory structure before reading individual files',
      ).toBeGreaterThanOrEqual(1);

      const firstDiscoveryIndex = toolLogs.findIndex(
        (log) =>
          log.toolRequest.name === 'list_directory' ||
          log.toolRequest.name === 'glob',
      );
      const firstReadIndex = toolLogs.findIndex(
        (log) =>
          log.toolRequest.name === 'read_file' ||
          log.toolRequest.name === 'read_many_files',
      );

      expect(
        firstDiscoveryIndex,
        'Expected at least one list_directory or glob call',
      ).toBeGreaterThanOrEqual(0);
      if (firstReadIndex >= 0) {
        expect(
          firstDiscoveryIndex,
          'Expected structure exploration (ls/glob) before reading individual files',
        ).toBeLessThan(firstReadIndex);
      }
    },
  });

  /**
   * When modifying a function that is used in many places, the agent
   * should find all callers before making changes.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should check for all callers before modifying a shared utility',
    prompt:
      'Rename formatDate to formatDateTime(date: Date, includeTime: boolean) in utils.ts and update all callers.',
    files: {
      'src/utils.ts': `
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
`,
      'src/report.ts': `
import { formatDate } from './utils.js';
export function generateReport(date: Date) {
  return \`Report for \${formatDate(date)}\`;
}
`,
      'src/invoice.ts': `
import { formatDate } from './utils.js';
export function createInvoice(date: Date) {
  return { date: formatDate(date), total: 0 };
}
`,
      'tests/utils.test.ts': `
import { formatDate } from '../src/utils.js';

export function formatsDateForTests(date: Date) {
  return formatDate(date);
}
`,
      'package.json': '{"name": "app", "type": "module"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent should have searched for all usages of formatDate
      const searchCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'read_many_files',
      );
      expect(
        searchCalls.length,
        'Expected agent to search for all usages before renaming',
      ).toBeGreaterThanOrEqual(1);

      // All three files should be updated
      const utils = readFileOrFail(rig, 'src/utils.ts');
      const report = readFileOrFail(rig, 'src/report.ts');
      const invoice = readFileOrFail(rig, 'src/invoice.ts');
      const testCaller = readFileOrFail(rig, 'tests/utils.test.ts');

      expect(utils).toContain('formatDateTime');
      expect(utils).toContain('includeTime');
      expect(report).toContain('formatDateTime');
      expect(invoice).toContain('formatDateTime');
      expect(testCaller).toContain('formatDateTime');

      expect(report).not.toContain('{ formatDate }');
      expect(testCaller).not.toContain('{ formatDate }');
      expect(report).toMatch(/formatDateTime\([^,]+,\s*[^)]+\)/);
      expect(invoice).toMatch(/formatDateTime\([^,]+,\s*[^)]+\)/);
      expect(testCaller).toMatch(/formatDateTime\([^,]+,\s*[^)]+\)/);
    },
  });
});
