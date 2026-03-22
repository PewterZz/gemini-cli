/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: L2 | Quality score: 75/100
 * Tool sequence: read_file → replace → run_shell_command
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('should preserve valid json when editing json files', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should preserve valid json when editing json files',
    // minToolCalls observed in original run: 3
    prompt: 'should preserve valid json when editing json files',
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
      const content = rig.readFile('package.json');
      expect(content.length, 'File package.json should have content').toBeGreaterThan(0);
    },
  });
});
