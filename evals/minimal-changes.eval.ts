/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';

const countLines = (content: string): number => content.split('\n').length;

const getBlankLineNumbers = (content: string): number[] =>
  content
    .split('\n')
    .map((line, index) => (line.trim().length === 0 ? index + 1 : null))
    .filter((lineNumber): lineNumber is number => lineNumber !== null);

const parseToolArgs = (rawArgs: unknown): Record<string, unknown> => {
  if (typeof rawArgs !== 'string') {
    return typeof rawArgs === 'object' && rawArgs !== null
      ? (rawArgs as Record<string, unknown>)
      : {};
  }
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const pathMatches = (filePath: string, targetPath: string): boolean =>
  filePath === targetPath || filePath.endsWith(`/${targetPath}`);

const targetedListFixtureLines = Array.from({ length: 80 }, (_, index) => {
  const lineNumber = index + 1;

  if (lineNumber === 1) return '// @format: preserve';
  if (lineNumber === 2) return '// Pagination utility';
  if (lineNumber === 3) return '// Author: Original Developer';
  if (lineNumber === 4) return '// Do not reformat this file';
  if (lineNumber === 5) return '';
  if (lineNumber === 28) return 'function paginate(items, page, perPage) {';
  if (lineNumber === 29)
    return '  const start = page * perPage; // BUG: should be (page - 1) * perPage';
  if (lineNumber === 30) return '    const end = start + perPage;';
  if (lineNumber === 31) return '  return items.slice(start, end);';
  if (lineNumber === 32) return '}';
  if (lineNumber === 33) return '';
  if (lineNumber === 34) return '// Helper utilities';
  if (lineNumber === 35) return 'function getPageCount(total, perPage) {';
  if (lineNumber === 36) return '    return Math.ceil(total / perPage);';
  if (lineNumber === 37) return '}';
  if (lineNumber === 38) return '';
  if (lineNumber === 39) return 'function validatePage(page, pageCount) {';
  if (lineNumber === 40) return '  if (pageCount === 0) {';
  if (lineNumber === 41) return '    return false;';
  if (lineNumber === 42) return '  }';
  if (lineNumber === 43) return '    return page >= 1 && page <= pageCount;';
  if (lineNumber === 44) return '}';
  if (lineNumber === 45) return '';
  if (lineNumber === 80)
    return 'module.exports = { paginate, getPageCount, validatePage };';

  return `const listLine${lineNumber} = 'line-${lineNumber}';`;
});

const targetedListFixture = targetedListFixtureLines.join('\n');

const lockProtectedMathFixtureLines = [
  '/**',
  ' * Math utilities',
  ' * Tested and stable - do not modify existing functions',
  ' */',
  'function add(a, b) {',
  '  return a + b;',
  '}',
  '',
  'function subtract(a, b) {',
  '  return a - b;',
  '}',
  '',
  'function padTicketNumber(value, width = 6) {',
  '  // space padding by design',
  "  return String(value).padStart(width, ' ');",
  '}',
  '',
  'module.exports = { add, subtract, padTicketNumber };',
  '',
  '/* LOCK: do not modify below this line */',
  "const LOCK_A = 'alpha';",
  "const LOCK_B = 'beta';",
  "const LOCK_C = 'gamma';",
  "const LOCK_D = 'delta';",
  "const LOCK_E = 'epsilon';",
];

const lockProtectedMathFixture = lockProtectedMathFixtureLines.join('\n');
const lockedTailBlock = lockProtectedMathFixtureLines.slice(20, 25).join('\n');

const configTypoFixtureLines = Array.from({ length: 80 }, (_, index) => {
  const lineNumber = index + 1;

  if (lineNumber === 1) return "const http = require('http');";
  if (lineNumber === 2) return "const APP_NAME = 'targeted-config-service';";
  if (lineNumber === 39) return 'const PORT = process.env.PORT || 3000;';
  if (lineNumber === 40)
    return '// The server will recieve requests on the configured port';
  if (lineNumber === 41) return "const HOST = process.env.HOST || 'localhost';";
  if (lineNumber === 80) return 'module.exports = { PORT, HOST, APP_NAME };';

  return `const settingLine${lineNumber} = 'line-${lineNumber}';`;
});

const configTypoFixture = `${configTypoFixtureLines.join('\n')}\n`;

const spacePaddingByDesignFunction = `function padTicketNumber(value, width = 6) {
  // space padding by design
  return String(value).padStart(width, ' ');
}`;

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
      'list.js': targetedListFixture,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'list.js');
      const originalLineCount = countLines(targetedListFixture);
      const finalLineCount = countLines(content);
      const originalBlankLines = new Set(
        getBlankLineNumbers(targetedListFixture),
      );
      const finalBlankLines = getBlankLineNumbers(content);
      const addedBlankLines = finalBlankLines.filter(
        (lineNumber) => !originalBlankLines.has(lineNumber),
      );
      const allowedAddedBlankLines = new Set([29]);

      expect(originalLineCount).toBe(80);
      expect(finalLineCount).toBe(originalLineCount);
      expect(finalLineCount).toBe(80);

      expect(
        addedBlankLines.every((lineNumber) =>
          allowedAddedBlankLines.has(lineNumber),
        ),
        `Unexpected new blank lines outside bug-fix location: ${addedBlankLines.join(', ')}`,
      ).toBe(true);

      for (const blankLineNumber of originalBlankLines) {
        const line = content.split('\n')[blankLineNumber - 1] ?? '';
        expect(
          line.trim(),
          `Blank line ${blankLineNumber} must remain blank`,
        ).toBe('');
      }

      // The bug should be fixed
      expect(content).toContain('const start = (page - 1) * perPage;');

      // The comment about not reformatting should still be present
      expect(content).toContain('Do not reformat');
      expect(content).toContain('// @format: preserve');

      // Mixed indentation must be preserved exactly
      expect(content).toContain('    const end = start + perPage;');
      expect(content).toContain('  return items.slice(start, end);');
      expect(content).toContain('    return Math.ceil(total / perPage);');
      expect(content).toContain('  if (pageCount === 0) {');
      expect(content).toContain('    return false;');
      expect(content).toContain('    return page >= 1 && page <= pageCount;');

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
      'Add a multiply function to math.js directly above the LOCK section. Do not change existing functions or anything below the LOCK comment.',
    files: {
      'math.js': lockProtectedMathFixture,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'math.js');
      const lines = content.split('\n');
      const lockLineIndex = lines.findIndex(
        (line) => line === '/* LOCK: do not modify below this line */',
      );
      const lockedTail = lines
        .slice(lockLineIndex + 1, lockLineIndex + 6)
        .join('\n');

      // New function added
      expect(content).toContain('multiply');

      expect(countLines(lockProtectedMathFixture)).toBe(25);
      expect(lines.length).toBeGreaterThanOrEqual(32);
      expect(lines.length).toBeLessThanOrEqual(35);
      expect(
        lockLineIndex,
        'LOCK section comment should remain present',
      ).toBeGreaterThanOrEqual(0);
      expect(lockedTail).toBe(lockedTailBlock);

      // Existing functions untouched
      expect(content).toContain('function add(a, b)');
      expect(content).toContain('function subtract(a, b)');
      expect(content).toContain(spacePaddingByDesignFunction);

      // Comment preserved
      expect(content).toContain('do not modify existing functions');
    },
  });

  /**
   * When fixing a typo in an existing file, the agent should use targeted edits
   * and avoid full-file overwrite with write_file.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use edit not write_file when modifying existing files',
    prompt:
      'Fix the typo on line 30 of handbook.js: change "adress" to "address" and do not modify any other lines.',
    files: {
      'handbook.js': Array.from({ length: 60 }, (_, index) => {
        const lineNumber = index + 1;
        if (lineNumber === 1) return "const docName = 'team-handbook';";
        if (lineNumber === 30)
          return '// Please confirm the shipping adress before dispatch.';
        if (lineNumber === 60) return 'module.exports = { docName };';
        return `const handbookLine${lineNumber} = 'line-${lineNumber}';`;
      }).join('\n'),
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'handbook.js');
      const toolLogs = rig.readToolLogs();
      const writeFileCallsToHandbook = toolLogs.filter((log) => {
        if (log.toolRequest.name !== 'write_file') {
          return false;
        }
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        return (
          typeof filePath === 'string' && pathMatches(filePath, 'handbook.js')
        );
      });

      expect(writeFileCallsToHandbook.length).toBe(0);
      expect(content).toContain('shipping address before dispatch');
      expect(content).not.toContain('shipping adress before dispatch');
      expect(countLines(content)).toBe(60);
    },
  });

  /**
   * When fixing a typo in a comment, the agent should not touch
   * any code logic.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should fix only the requested typo without touching code',
    prompt:
      'Fix the typo in the comment on line 40 of config.js. "recieve" should be "receive".',
    files: {
      'config.js': configTypoFixture,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'config.js');
      const finalLines = content.trimEnd().split('\n');

      // Typo fixed
      expect(content).toContain('receive');
      expect(content).not.toContain('recieve');
      expect(finalLines[39]).toBe(
        '// The server will receive requests on the configured port',
      );

      expect(finalLines.length).toBe(configTypoFixtureLines.length);
      expect(finalLines.slice(0, 39)).toEqual(
        configTypoFixtureLines.slice(0, 39),
      );
      expect(finalLines.slice(40, 80)).toEqual(
        configTypoFixtureLines.slice(40, 80),
      );
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
    prompt: 'Just add a formatOrderSummary function to order.js.',
    files: {
      'order.js': `
const TAX_RATE = 0.1;

function calculateTax(subtotal) {
  return subtotal * TAX_RATE;
}

// @deprecated -- will be removed in v3
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
      const content = readFileOrFail(rig, 'order.js');

      // New function should be added
      expect(content).toContain('function formatOrderSummary');

      // Deprecated function marker must be preserved
      expect(content).toContain('// @deprecated -- will be removed in v3');

      // All original functions should still be there unchanged
      expect(content).toContain('calculateTax');
      expect(content).toContain('applyDiscount');
      expect(content).toContain('TAX_RATE = 0.1');
    },
  });
});
