/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Activate Skill', () => {
  /**
   * When a skill is available and the user asks for something that matches
   * the skill's description, the agent should activate it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should activate a matching skill when one is available',
    prompt:
      'Use the code-review skill to review app.ts and tell me what it does.',
    files: {
      '.gemini/agents/code-review.md': `---
name: code-review
description: Reviews code and explains what it does.
tools:
  - read_file
---

You are a code review agent. Read the file provided and explain what it does in 2-3 sentences.
`,
      'app.ts': `
export function divide(a: number, b: number): number {
  return a / b;
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      // Agent should have invoked the skill (either via activate_skill or directly as a subagent)
      const skillCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'activate_skill' ||
          log.toolRequest.name === 'code-review',
      );
      expect(
        skillCalls.length,
        'Expected agent to activate or invoke the code-review skill',
      ).toBeGreaterThanOrEqual(1);
    },
  });

  /**
   * When no skill matches the request, the agent should handle it directly
   * without trying to activate a non-existent skill.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not activate skill when none matches the request',
    prompt: 'What does the divide function in app.ts do?',
    files: {
      '.gemini/agents/deploy.md': `---
name: deploy
description: Deploys the application to production servers.
---

You are a deployment agent. Handle deployment tasks.
`,
      'app.ts': `
export function divide(a: number, b: number): number {
  return a / b;
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const skillCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'activate_skill',
      );
      expect(
        skillCalls.length,
        'Agent should not activate an unrelated skill',
      ).toBe(0);
    },
  });
});
