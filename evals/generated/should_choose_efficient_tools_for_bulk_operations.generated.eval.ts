/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: L3 | Quality score: 100/100
 * Tool sequence: grep_search → read_file → grep_search → read_file → read_file → read_file → write_file → write_file → write_file → generalist → read_file → read_file → read_file → list_directory → grep_search
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('should choose efficient tools for bulk operations', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should choose efficient tools for bulk operations',
    // minToolCalls observed in original run: 15
    prompt: 'should choose efficient tools for bulk operations',
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
      const writeOps = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file' || log.toolRequest.name === 'replace',
      );
      expect(writeOps.length, 'Expected file write or replace').toBeGreaterThanOrEqual(1);
    },
  });
});
