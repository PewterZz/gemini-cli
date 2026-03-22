/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: L2 | Quality score: 90/100
 * Tool sequence: read_file → write_file → write_file → run_shell_command → run_shell_command
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('should handle deeply nested file paths', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should handle deeply nested file paths',
    // minToolCalls observed in original run: 5
    prompt: 'should handle deeply nested file paths',
    files: {
      // TODO: Add file setup matching original session context
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const writeOps = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file' || log.toolRequest.name === 'replace',
      );
      expect(writeOps.length, 'Expected file write or replace').toBeGreaterThanOrEqual(1);
      // Verify the file was actually modified
      const content = rig.readFile('src/lib/utils/helpers.js');
      expect(content.length, 'File src/lib/utils/helpers.js should have content').toBeGreaterThan(0);
    },
  });
});
