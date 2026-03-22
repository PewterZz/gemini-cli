/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: L2 | Quality score: 50/100
 * Tool sequence: list_directory → read_file → list_directory
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('should answer questions without making changes', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should answer questions without making changes',
    // minToolCalls observed in original run: 3
    prompt: 'should answer questions without making changes',
    files: {
      // TODO: Add file setup matching original session context
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const listdirectoryCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'list_directory',
      );
      expect(listdirectoryCalls.length, 'Expected list_directory call').toBeGreaterThanOrEqual(1);
    },
  });
});
