/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

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
      ['src/config/app.ts', 'export const port = 3000;\n'],
      ['package.json', '{"name": "large-app", "type": "module"}'],
    ]),
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Agent must use search tools -- should NOT read all 25+ files
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      const searchCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'grep_search' ||
          log.toolRequest.name === 'glob',
      );

      // Either used search tools or read strategically (fewer than half the files)
      const usedSearchOrStrategic =
        searchCalls.length > 0 || readCalls.length < 10;
      expect(
        usedSearchOrStrategic,
        `Agent should search or read strategically, not read all ${readCalls.length} files`,
      ).toBe(true);
    },
  });

  /**
   * When asked to find all uses of a function across a large codebase,
   * the agent should use grep_search rather than reading every file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use grep to find all usages of a function across many files',
    prompt:
      'Find all places in this codebase that call the authenticate() function.',
    files: Object.fromEntries([
      ...Array.from({ length: 15 }, (_, i) => [
        `src/routes/route${i}.ts`,
        i % 3 === 0
          ? `import { authenticate } from '../auth.js';\nexport function handle${i}() { authenticate(token); }\n`
          : `export function handle${i}() { return ${i}; }\n`,
      ]),
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
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const grepCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'grep_search',
      );
      expect(
        grepCalls.length,
        'Expected agent to use grep_search to find function usages',
      ).toBeGreaterThanOrEqual(1);
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
      ['src/api/users.ts', 'export const usersRouter = {};\n'],
      ['src/api/orders.ts', 'export const ordersRouter = {};\n'],
      ['src/services/payment.ts', 'export function processPayment() {}\n'],
      ['src/services/email.ts', 'export function sendEmail() {}\n'],
      [
        'src/models/user.ts',
        'export interface User { id: number; name: string; }\n',
      ],
      [
        'src/models/order.ts',
        'export interface Order { id: number; total: number; }\n',
      ],
      ['src/utils/logger.ts', 'export const logger = console;\n'],
      ['src/utils/validator.ts', 'export function validate() {}\n'],
      ['src/index.ts', 'import "./api/users.js"; import "./api/orders.js";\n'],
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
    },
  });

  /**
   * When modifying a function that is used in many places, the agent
   * should find all callers before making changes.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should check for all callers before modifying a shared utility',
    prompt:
      'Rename the formatDate function to formatDateTime in utils.ts and update all callers.',
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
      const utils = rig.readFile('src/utils.ts');
      const report = rig.readFile('src/report.ts');
      const invoice = rig.readFile('src/invoice.ts');

      expect(utils).toContain('formatDateTime');
      expect(report).toContain('formatDateTime');
      expect(invoice).toContain('formatDateTime');
    },
  });
});
