/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Get Internal Docs', () => {
  /**
   * When the user asks about Gemini CLI features, commands, or configuration,
   * the agent should consult internal documentation rather than guessing.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should consult internal docs for CLI-specific questions',
    prompt:
      'How do I configure custom tools in Gemini CLI? Check the documentation.',
    files: {
      'app.js': 'console.log("hello");',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const docsCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'get_internal_docs',
      );
      expect(
        docsCalls.length,
        'Expected agent to consult internal docs for CLI-specific questions',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When the user asks a general programming question unrelated to Gemini CLI,
   * the agent should NOT use get_internal_docs.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not use internal docs for general programming questions',
    prompt: 'How do I sort an array in JavaScript?',
    files: {
      'app.js': 'const arr = [3, 1, 2];',
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const docsCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'get_internal_docs',
      );
      expect(
        docsCalls.length,
        'Agent should not use internal docs for general programming questions',
      ).toBe(0);
    },
  });
});
