/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: L1 | Quality score: 50/100
 * Tool sequence: read_file → replace
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('should handle ambiguous prompts reasonably', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should handle ambiguous prompts reasonably',
    // minToolCalls observed in original run: 2
    prompt: 'should handle ambiguous prompts reasonably',
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
      const content = rig.readFile('app.js');
      expect(content.length, 'File app.js should have content').toBeGreaterThan(0);
    },
  });
});
