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

const getTrackedLogs = (rig: { readToolLogs: () => ToolLog[] }): ToolLog[] =>
  rig.readToolLogs();

const getReadCalls = (logs: ToolLog[]) =>
  logs.filter((log) => READ_TOOL_NAMES.has(log.toolRequest.name));

const getEditCalls = (logs: ToolLog[]) =>
  logs.filter((log) => EDIT_TOOL_NAMES.has(log.toolRequest.name));

const getWebCalls = (logs: ToolLog[]) =>
  logs.filter((log) => WEB_TOOL_NAMES.has(log.toolRequest.name));

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
      const readCalls = getReadCalls(logs);
      const webCalls = getWebCalls(logs);

      expect(
        readCalls.length,
        'Expected local source inspection for fetch behavior',
      ).toBeGreaterThanOrEqual(1);
      expect(
        webCalls.length,
        'Expected web_search or web_fetch for fetch specification verification',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(/fetch|network|reject|exception/i);
      expect(result).toMatch(
        /response\.ok|status|non-2xx|404|500|http error|typeerror|throw|catch/i,
      );
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'deprecated crypto api check should use web and local search',
    prompt: 'Check if any of our crypto code is deprecated.',
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
      'src/security/modern-encryption.ts': `
import crypto from 'node:crypto';

export function encryptWithIv(
  plaintext: string,
  key: Buffer,
  iv: Buffer,
): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
}
`,
      'src/security/index.ts': 'export { encrypt } from "./encryption.js";\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const editCalls = getEditCalls(logs);
      const webCalls = getWebCalls(logs);

      expect(
        readCalls.length,
        'Expected local code inspection before migration guidance',
      ).toBeGreaterThanOrEqual(1);
      expect(
        webCalls.length,
        'Expected external deprecation lookup for crypto API migration guidance',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(
        /createCipher[^\n]*deprecated|deprecated[^\n]*createCipher/i,
      );
      expect(result).toMatch(
        /createCipheriv[^\n]*(acceptable|correct|safe|modern|recommended|not deprecated)/i,
      );
      expect(
        editCalls.length,
        'This task is analysis-focused and should avoid broad rewrites',
      ).toBeLessThanOrEqual(3);
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
          lodash: '4.17.20',
          express: '^4.19.2',
        },
      }),
      'src/index.ts': 'import _ from "lodash";\nexport const trim = _.trim;\n',
      'README.md': 'Dependencies are managed with npm.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const webCalls = getWebCalls(logs);

      expect(
        readCalls.length,
        'Expected local dependency inspection before vulnerability assessment',
      ).toBeGreaterThanOrEqual(1);
      expect(
        webCalls.length,
        'Expected web_search or web_fetch for CVE/advisory lookup',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(/lodash|4\.17\.20/i);
      expect(result).toMatch(
        /4\.17\.20[^\n]*(safe|not vulnerable|vulnerable|affected)/i,
      );
      expect(result).toMatch(/prototype pollution|4\.17\.21|fix|upgrade/i);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'agent should identify when an npm package version has a known breaking change',
    prompt:
      'Check whether upgrading Express would break this code and explain any known breaking changes we should watch for.',
    files: {
      'package.json': JSON.stringify({
        name: 'express-upgrade-check',
        version: '1.0.0',
        dependencies: {
          express: '4.21.0',
        },
      }),
      'src/server.js': `
const express = require('express');

const app = express();

app.post('/orders', (req, res) => {
  const orderId = req.body.orderId;
  res.json({ orderId });
});

module.exports = { app };
`,
      'README.md':
        'Server was originally written with older Express defaults.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const webCalls = getWebCalls(logs);

      expect(readCalls.length).toBeGreaterThanOrEqual(1);
      expect(
        webCalls.length,
        'Expected web_search or web_fetch for version-specific breaking-change verification',
      ).toBeGreaterThanOrEqual(1);
      expect(result).toMatch(/express|4\.21\.0|5(\.x)?|upgrade/i);
      expect(result).toMatch(/body-parser|express\s*5|breaking change/i);
    },
  });

  evalTest('USUALLY_PASSES', {
    name: 'should identify api version mismatch in local codebase',
    prompt:
      'Our API client is calling a v2 endpoint but we migrated to v3. Find the mismatch.',
    files: {
      'src/api-client.ts': `
export async function bulkUsers(baseUrl: string, body: unknown) {
  const response = await fetch(baseUrl + '/v2/users/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function getUser(baseUrl: string, id: string) {
  const response = await fetch(baseUrl + '/v3/users/' + id);
  return response.json();
}
`,
      'project.json': `{
  "name": "api-migration",
  "apiVersion": "v3",
  "release": "2026.03"
}
`,
      'README.md':
        '# API Client\nThis project was recently migrated from API v2 to v3. All endpoints should use /v3/.\n',
    },
    assert: async (rig, result) => {
      const logs = getTrackedLogs(rig);
      const readCalls = getReadCalls(logs);
      const inspectedBoth = readCalls.some((log) =>
        log.toolRequest.args.includes('api-client.ts'),
      );

      expect(inspectedBoth, 'Expected local inspection of api-client.ts').toBe(
        true,
      );
      expect(result).toMatch(/v2|v3|mismatch|bulk|outdated|update/i);
      expect(result).toMatch(/\/v2\/users\/bulk|bulkUsers/i);
    },
  });
});
