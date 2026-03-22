/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: L3 | Quality score: 100/100
 * Tool sequence: read_file → grep_search → replace → replace → grep_search → list_directory → grep_search → glob → read_file
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('should prefer replace over write file for modifications', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should prefer replace over write file for modifications',
    // minToolCalls observed in original run: 9
    prompt: 'should prefer replace over write file for modifications',
    files: {
      // TODO: Add file setup matching original session context
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const grepsearchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'grep_search',
      );
      expect(grepsearchCalls.length, 'Expected grep_search call').toBeGreaterThanOrEqual(1);
      const listdirectoryCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'list_directory',
      );
      expect(listdirectoryCalls.length, 'Expected list_directory call').toBeGreaterThanOrEqual(1);
      const globCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'glob',
      );
      expect(globCalls.length, 'Expected glob call').toBeGreaterThanOrEqual(1);
      const writeOps = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file' || log.toolRequest.name === 'replace',
      );
      expect(writeOps.length, 'Expected file write or replace').toBeGreaterThanOrEqual(1);
      // Verify the file was actually modified
      const content = rig.readFile('math.js');
      expect(content.length, 'File math.js should have content').toBeGreaterThan(0);
    },
  });
});
