/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Write Todos', () => {
  /**
   * When the user explicitly asks the agent to create a todo list or track
   * tasks, the agent should use write_todos.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use write_todos when asked to create a task list',
    prompt:
      'Refactor app.js: extract all helper functions into a separate utils.js file, add proper error handling to each function, write unit tests in app.test.js, and update the main module to import from utils.js.',
    files: {
      'app.js': `
function processData(data) {
  const result = data.map(item => item.value * 2);
  console.log(result);
  return result;
}
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();
      const todoCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'write_todos',
      );
      expect(
        todoCalls.length,
        'Expected agent to use write_todos for task tracking',
      ).toBeGreaterThanOrEqual(1);
    },
  });
});
