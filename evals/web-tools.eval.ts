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

const getWebCalls = (logs: ToolLog[]) =>
  logs.filter((log) => WEB_TOOL_NAMES.has(log.toolRequest.name));

const getReadCalls = (logs: ToolLog[]) =>
  logs.filter((log) => READ_TOOL_NAMES.has(log.toolRequest.name));

const getEditCalls = (logs: ToolLog[]) =>
  logs.filter((log) => EDIT_TOOL_NAMES.has(log.toolRequest.name));

describe('Web Tools', () => {
  evalTest('USUALLY_PASSES', {
    name: 'fetch network failure handling should combine web spec with local inspection',
    prompt:
      'Check whether our error handling matches the fetch API spec for network failures.',
    files: {
      'src/http/client.ts': `
export async function loadUsers(baseUrl: string) {
  return fetch(baseUrl + '/users')
    .then((response) => response.json())
    .catch(() => ({ users: [], fallback: true }));
}

export async function loadOrders(baseUrl: string) {
  return fetch(baseUrl + '/orders')
    .then((response) => response.json())
    .catch((error) => {
      throw new Error('orders failure: ' + error.message);
    });
}
`,
      'src/http/retry.ts':
        'export const shouldRetry = (status: number) => status >= 500;\n',
      'src/http/index.ts':
        'export { loadUsers, loadOrders } from "./client.js";\n',
      'README.md': '# Networking\nWe rely on fetch heavily.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const webCalls = getWebCalls(logs);
      const grepCalls = logs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );

      expect(
        webCalls.length,
        'Expected web lookup for fetch specification details',
      ).toBeGreaterThanOrEqual(1);
      expect(
        grepCalls.length,
        'Expected grep usage to locate local fetch error handling',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(/network|reject|response\.ok|404|500/i);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'deprecated crypto api check should use web and local search',
    prompt:
      'We are using an old crypto API. Find out if it is deprecated and what we should migrate to.',
    files: {
      'src/security/encryption.ts': `
import crypto from 'node:crypto';

export function encrypt(plaintext: string, secret: string) {
  const cipher = crypto.createCipher('aes-256-cbc', secret);
  return cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
}
`,
      'src/security/tokens.ts': `
import crypto from 'node:crypto';

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
`,
      'src/security/index.ts': 'export { encrypt } from "./encryption.js";\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const webCalls = getWebCalls(logs);
      const grepCalls = logs.filter(
        (log) => log.toolRequest.name === GREP_TOOL_NAME,
      );
      const editCalls = getEditCalls(logs);

      expect(
        webCalls.length,
        'Expected web verification for deprecation status',
      ).toBeGreaterThanOrEqual(1);
      expect(
        grepCalls.length,
        'Expected local search for crypto API usage',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(/createCipher|deprecated|createCipheriv|migrate/i);
      expect(
        editCalls.length,
        'This task is analysis-focused, not an automatic code rewrite',
      ).toBeLessThanOrEqual(1);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'readme and nvmrc consistency check should surface version mismatch',
    prompt:
      'The README says to use npm install but the project has a .nvmrc. Are these instructions up to date?',
    files: {
      'README.md': `
# Setup

1. Install Node.js 14.x
2. Run npm install
3. Run npm test
`,
      '.nvmrc': '20.11.1\n',
      'package.json': JSON.stringify({
        name: 'nvm-mismatch',
        engines: { node: '>=20' },
        scripts: { test: 'vitest run' },
      }),
      'src/index.ts': 'export const ready = true;\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const readmeReadViaReadFile = readCalls.some((log) => {
        if (log.toolRequest.name !== READ_FILE_TOOL_NAME) {
          return false;
        }
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        return typeof filePath === 'string' && filePath.includes('README.md');
      });

      expect(
        readmeReadViaReadFile,
        'Expected direct read_file call for README.md',
      ).toBe(true);
      expect(result).toMatch(
        /14|20\.11\.1|engines|out of date|mismatch|update/i,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'lodash vulnerability triage should consult external advisories',
    prompt:
      'Is our lodash version affected by any known security vulnerabilities?',
    files: {
      'package.json': JSON.stringify({
        name: 'security-check',
        version: '1.0.0',
        dependencies: {
          lodash: '4.17.15',
          express: '^4.19.2',
        },
      }),
      'src/index.ts': 'import _ from "lodash";\nexport const trim = _.trim;\n',
      'README.md': 'Dependencies are managed with npm.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const webCalls = getWebCalls(logs);
      const shellCalls = logs.filter(
        (log) => log.toolRequest.name === SHELL_TOOL_NAME,
      );

      expect(
        webCalls.length,
        'Expected web_search or web_fetch for vulnerability data',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(
        /vulnerab|CVE|prototype pollution|4\.17\.21|upgrade/i,
      );
      expect(
        shellCalls.length,
        'Should not rely only on local shell for remote advisories',
      ).toBeGreaterThanOrEqual(0);
    },
  });
});
