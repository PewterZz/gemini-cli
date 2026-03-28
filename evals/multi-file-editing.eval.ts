/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';
import path from 'node:path';

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

const extractRelativeImports = (
  filePath: string,
  content: string,
): string[] => {
  const dirname = path.posix.dirname(filePath);
  const dependencies = new Set<string>();
  const requireRegex = /require\(['"](\.[^'"]+)['"]\)/g;
  const importRegex = /from\s+['"](\.[^'"]+)['"]/g;

  for (const regex of [requireRegex, importRegex]) {
    let match = regex.exec(content);
    while (match) {
      const specifier = match[1] ?? '';
      if (specifier) {
        const normalized = path.posix.normalize(
          path.posix.join(
            dirname,
            specifier.endsWith('.js') ? specifier : `${specifier}.js`,
          ),
        );
        dependencies.add(normalized);
      }
      match = regex.exec(content);
    }
  }

  return Array.from(dependencies);
};

const hasImportCycle = (graph: Record<string, string[]>): boolean => {
  const visited = new Set<string>();
  const active = new Set<string>();

  const visit = (node: string): boolean => {
    if (active.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    active.add(node);

    for (const neighbor of graph[node] ?? []) {
      if (!(neighbor in graph)) continue;
      if (visit(neighbor)) return true;
    }

    active.delete(node);
    return false;
  };

  return Object.keys(graph).some((node) => visit(node));
};

describe('Multi-File Editing', () => {
  /**
   * When asked to rename a function, the agent should update all files
   * that reference it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should update all references when renaming a function',
    prompt:
      'Rename pricing.calculateTotal to pricing.computeTotal across all pricing references. Do not rename cart.calculateTotal.',
    files: {
      'src/pricing.js': `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
module.exports = { calculateTotal };
`,
      'src/cart.js': `
const { calculateTotal: calculatePricingTotal } = require('./pricing');

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartSummary(cart) {
  return {
    itemCount: calculateTotal(cart.items),
    total: calculatePricingTotal(cart.items),
  };
}
module.exports = { getCartSummary, calculateTotal };
`,
      'src/cart-metrics.js': `
function calculateTotal(carts) {
  return carts.reduce((sum, cart) => sum + cart.items.length, 0);
}

module.exports = { calculateTotal };
`,
      'test/pricing.test.js': `
const { calculateTotal } = require('../src/pricing');

test('calculateTotal returns correct sum', () => {
  const items = [{ price: 10, quantity: 2 }, { price: 5, quantity: 1 }];
  expect(calculateTotal(items)).toBe(25);
});
`,
    },
    assert: async (rig) => {
      // All three files should be updated
      const pricing = readFileOrFail(rig, 'src/pricing.js');
      const cart = readFileOrFail(rig, 'src/cart.js');
      const cartMetrics = readFileOrFail(rig, 'src/cart-metrics.js');
      const test = readFileOrFail(rig, 'test/pricing.test.js');

      expect(pricing).toContain('computeTotal');
      expect(pricing).not.toContain('function calculateTotal(');

      expect(cart).toContain('computeTotal');
      expect(cart).toContain('function calculateTotal(items)');
      expect(cart).toContain('itemCount: calculateTotal(cart.items)');

      expect(test).toContain('computeTotal');
      expect(test).not.toContain('const { calculateTotal }');
      expect(test).not.toContain('expect(calculateTotal(items))');

      expect(cartMetrics).toContain('function calculateTotal(carts)');
      expect(cartMetrics).not.toContain('computeTotal');
    },
  });

  /**
   * When asked to add an export, the agent should update both the source
   * and any index/barrel files.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should update barrel exports when adding a new module',
    prompt:
      'Create a new validator.js module in src/ with a validateEmail function, and export it from src/index.js',
    files: {
      'src/index.js': `
const { formatDate } = require('./utils');
const { parseCSV } = require('./parser');

module.exports = { formatDate, parseCSV };
`,
      'src/utils.js': `
function formatDate(d) { return d.toISOString(); }
module.exports = { formatDate };
`,
      'src/parser.js': `
function parseCSV(text) { return text.split('\\n').map(r => r.split(',')); }
module.exports = { parseCSV };
`,
    },
    assert: async (rig) => {
      // New file should exist
      const validator = readFileOrFail(rig, 'src/validator.js');
      expect(validator).toContain('validateEmail');

      // Index should export it
      const index = readFileOrFail(rig, 'src/index.js');
      expect(index).toContain('validator');
      expect(index).toContain('validateEmail');
    },
  });

  /**
   * When adding a new dependency import, the agent should add it to the
   * correct location in the file without disrupting existing imports.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add imports without disrupting existing ones',
    prompt:
      'Use the existing formatCurrency helper when rendering totals in src/c.js. Update imports as needed, but avoid creating circular imports.',
    files: {
      'src/a.js': `
const { renderCheckoutSummary } = require('./b');

function formatCurrency(amount) {
  return '$' + amount.toFixed(2);
}

function checkout(items) {
  return renderCheckoutSummary(items);
}

module.exports = { checkout, formatCurrency };
`,
      'src/b.js': `
const { summarizeItems } = require('./c');

function renderCheckoutSummary(items) {
  return summarizeItems(items);
}

module.exports = { renderCheckoutSummary };
`,
      'src/c.js': `
function summarizeItems(items) {
  const total = items.reduce((sum, item) => sum + item.price, 0);
  return 'Total: ' + total;
}

module.exports = { summarizeItems };
`,
    },
    assert: async (rig) => {
      const a = readFileOrFail(rig, 'src/a.js');
      const b = readFileOrFail(rig, 'src/b.js');
      const c = readFileOrFail(rig, 'src/c.js');
      const graph = {
        'src/a.js': extractRelativeImports('src/a.js', a),
        'src/b.js': extractRelativeImports('src/b.js', b),
        'src/c.js': extractRelativeImports('src/c.js', c),
      };

      expect(a).toContain("require('./b')");
      expect(b).toContain("require('./c')");
      expect(c).toMatch(/formatCurrency|formatter|formatValue/);
      expect(graph['src/c.js']).not.toContain('src/a.js');
      expect(hasImportCycle(graph)).toBe(false);
    },
  });

  /**
   * When asked to move a function to a different file, the agent should
   * remove it from the source and add it to the target, updating imports.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should move a function between files and update imports',
    prompt:
      'Move normalizeInput from helpers.ts to validation.ts and update app.ts imports. Do not modify helper.ts (singular).',
    files: {
      'app.ts': `
import { normalizeInput, processToken } from './helpers';

export function processRequest(req: { body: { data: string } }) {
  const clean = normalizeInput(req.body.data);
  return { result: processToken(clean) };
}
`,
      'helpers.ts': `
export function normalizeInput(input: string) {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input');
  }
  return input.trim();
}

export function processToken(value: string) {
  return value.toUpperCase();
}

export const helperVersion = 'v1';
`,
      'helper.ts': `
export function helperName() {
  return 'do-not-touch-singular-file';
}

export const HELPER_MODE = 'singular';
`,
    },
    assert: async (rig) => {
      const app = readFileOrFail(rig, 'app.ts');
      const helpers = readFileOrFail(rig, 'helpers.ts');
      const helperSingular = readFileOrFail(rig, 'helper.ts');
      const validation = readFileOrFail(rig, 'validation.ts');
      const toolLogs = rig.readToolLogs();

      const changedFileCalls = toolLogs.filter((log) =>
        ['replace', 'edit', 'write_file'].includes(log.toolRequest.name),
      );
      const touchedHelpersPlural = changedFileCalls.some((log) => {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        return (
          typeof filePath === 'string' && pathMatches(filePath, 'helpers.ts')
        );
      });
      const touchedHelperSingular = changedFileCalls.some((log) => {
        const args = parseToolArgs(log.toolRequest.args);
        const filePath = args['file_path'];
        return (
          typeof filePath === 'string' && pathMatches(filePath, 'helper.ts')
        );
      });

      expect(app).not.toMatch(/from ['"]\.\/helpers['"]/);
      expect(app).toMatch(/from ['"]\.\/validation['"]/);
      expect(app).toContain('normalizeInput');
      expect(app).toContain('processRequest');

      expect(helpers).not.toContain('function normalizeInput');
      expect(helpers).toContain('processToken');

      expect(validation).toContain('function normalizeInput');
      expect(validation).toContain('export');

      expect(helperSingular).toBe(`
export function helperName() {
  return 'do-not-touch-singular-file';
}

export const HELPER_MODE = 'singular';
`);

      expect(touchedHelpersPlural).toBe(true);
      expect(touchedHelperSingular).toBe(false);
    },
  });
});
