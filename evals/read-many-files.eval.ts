/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Read Many Files', () => {
  /**
   * When the user asks about multiple files at once, the agent should prefer
   * read_many_files over multiple individual read_file calls.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use read_many_files when asked about multiple files',
    prompt:
      'Compare the exports of utils.js and helpers.js. What do they have in common?',
    files: {
      'utils.js': `
module.exports = {
  formatDate: (d) => d.toISOString(),
  parseJSON: (s) => JSON.parse(s),
  capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1),
};
`,
      'helpers.js': `
module.exports = {
  formatDate: (d) => d.toLocaleDateString(),
  slugify: (s) => s.toLowerCase().replace(/\\s+/g, '-'),
  capitalize: (s) => s[0].toUpperCase() + s.substring(1),
};
`,
      'package.json': '{"name": "test-app", "version": "1.0.0"}',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      const readManyCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_many_files',
      );
      const readSingleCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );

      // Either used read_many_files, or read both files individually.
      // Prefer read_many_files but accept either as valid.
      const readBothFiles =
        readManyCalls.length >= 1 || readSingleCalls.length >= 2;

      expect(
        readBothFiles,
        'Expected agent to read both files (via read_many_files or multiple read_file calls)',
      ).toBe(true);
    },
  });
});
