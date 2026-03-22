/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Minimal Changes', () => {
  /**
   * When fixing a specific bug, the agent should make targeted changes
   * without reformatting the entire file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should make a targeted fix without reformatting the whole file',
    prompt:
      'Fix the off-by-one error in the paginate function in list.js. Only change what is necessary.',
    files: {
      'list.js': `// Pagination utility
// Author: Original Developer
// Do not reformat this file

function paginate(items, page, perPage) {
  const start = page * perPage; // BUG: should be (page - 1) * perPage
  const end = start + perPage;
  return items.slice(start, end);
}

// Helper utilities
function getPageCount(total, perPage) {
  return Math.ceil(total / perPage);
}

function validatePage(page, pageCount) {
  return page >= 1 && page <= pageCount;
}

module.exports = { paginate, getPageCount, validatePage };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('list.js');

      // The bug should be fixed
      expect(content).toMatch(/page\s*-\s*1/);

      // The comment about not reformatting should still be present
      expect(content).toContain('Do not reformat');

      // Helper functions should be unchanged
      expect(content).toContain('getPageCount');
      expect(content).toContain('validatePage');
      expect(content).toContain('Math.ceil');
    },
  });

  /**
   * When asked to add a small feature, the agent should not rewrite
   * unrelated parts of the file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should not rewrite unrelated code when adding a small feature',
    prompt:
      'Add a multiply function to math.js. Do not change the existing functions.',
    files: {
      'math.js': `/**
 * Math utilities
 * Tested and stable - do not modify existing functions
 */
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('math.js');

      // New function added
      expect(content).toContain('multiply');

      // Existing functions untouched
      expect(content).toContain('function add(a, b)');
      expect(content).toContain('function subtract(a, b)');

      // Comment preserved
      expect(content).toContain('do not modify existing functions');
    },
  });

  /**
   * When fixing a typo in a comment, the agent should not touch
   * any code logic.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should fix only the requested typo without touching code',
    prompt:
      'Fix the typo in the comment on line 3 of config.js. "recieve" should be "receive".',
    files: {
      'config.js': `const http = require('http');
// Server configuration
// The server will recieve requests on the following port
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

module.exports = { PORT, HOST };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('config.js');

      // Typo fixed
      expect(content).toContain('receive');
      expect(content).not.toContain('recieve');

      // Code logic unchanged
      expect(content).toContain('PORT = process.env.PORT || 3000');
      expect(content).toContain('HOST = process.env.HOST');
    },
  });

  /**
   * When a task only requires reading, the agent should not write anything.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should only read files when asked to summarize',
    prompt: 'Summarize what each function in utils.js does.',
    files: {
      'utils.js': `
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function slugify(str) {
  return str.toLowerCase().replace(/\\s+/g, '-').replace(/[^\\w-]/g, '');
}

module.exports = { capitalize, truncate, slugify };
`,
    },
    assert: async (rig) => {
      const toolLogs = rig.readToolLogs();

      // Should have read the file
      const readCalls = toolLogs.filter(
        (log) => log.toolRequest.name === 'read_file',
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);

      // Should NOT have written anything
      const writeCalls = toolLogs.filter(
        (log) =>
          log.toolRequest.name === 'write_file' ||
          log.toolRequest.name === 'replace',
      );
      expect(
        writeCalls.length,
        'Should not modify files when summarizing',
      ).toBe(0);
    },
  });

  /**
   * When the user says "just add X", the agent should add X and nothing else.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should respect scope when user says "just add"',
    prompt:
      'Just add a console.log at the start of the processOrder function in order.js.',
    files: {
      'order.js': `
const TAX_RATE = 0.1;

function calculateTax(subtotal) {
  return subtotal * TAX_RATE;
}

function applyDiscount(total, discount) {
  return total - (total * discount);
}

function processOrder(items, discount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const tax = calculateTax(subtotal);
  const discounted = applyDiscount(subtotal + tax, discount);
  return { subtotal, tax, total: discounted };
}

module.exports = { processOrder };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('order.js');

      // console.log should be added to processOrder
      expect(content).toContain('console.log');

      // All original functions should still be there unchanged
      expect(content).toContain('calculateTax');
      expect(content).toContain('applyDiscount');
      expect(content).toContain('TAX_RATE = 0.1');
    },
  });
});
