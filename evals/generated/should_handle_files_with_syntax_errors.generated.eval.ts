/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: L3 | Quality score: 100/100
 * Tool sequence: read_file → replace → list_directory → read_file → list_directory → run_shell_command → read_file
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('should handle files with syntax errors', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should handle files with syntax errors',
    // minToolCalls observed in original run: 7
    prompt: 'should handle files with syntax errors',
    files: {
      // TODO: Add file setup matching original session context
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const listdirectoryCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'list_directory',
      );
      expect(listdirectoryCalls.length, 'Expected list_directory call').toBeGreaterThanOrEqual(1);
      const writeOps = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_file' || log.toolRequest.name === 'replace',
      );
      expect(writeOps.length, 'Expected file write or replace').toBeGreaterThanOrEqual(1);
      // Verify the file was actually modified
      const content = rig.readFile('broken.js');
      expect(content.length, 'File broken.js should have content').toBeGreaterThan(0);
    },
  });
});
