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
    prompt: 'Use the code-review skill to review my changes in app.ts',
    files: {
      '.gemini/agents/code-review.md': `---
name: code-review
description: Reviews code changes for bugs, style issues, and best practices.
---

You are a code review agent. Review the provided code for:
- Bugs and logic errors
- Style and naming conventions
- Performance concerns
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
        'Expected agent to activate the code-review skill',
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
