/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';

describe('Multi-File Editing', () => {
  /**
   * When asked to rename a function, the agent should update all files
   * that reference it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should update all references when renaming a function',
    prompt:
      'Rename the function "calculateTotal" to "computeTotal" across all files.',
    files: {
      'src/pricing.js': `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
module.exports = { calculateTotal };
`,
      'src/cart.js': `
const { calculateTotal } = require('./pricing');

function getCartSummary(cart) {
  return {
    itemCount: cart.items.length,
    total: calculateTotal(cart.items),
  };
}
module.exports = { getCartSummary };
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
      const test = readFileOrFail(rig, 'test/pricing.test.js');

      expect(pricing).toContain('computeTotal');
      expect(pricing).not.toContain('calculateTotal');

      expect(cart).toContain('computeTotal');
      expect(cart).not.toContain('calculateTotal');

      expect(test).toContain('computeTotal');
      expect(test).not.toContain('calculateTotal');
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
      'Add lodash as an import in app.js and use _.debounce to wrap the handleSearch function.',
    files: {
      'app.js': `
const express = require('express');
const cors = require('cors');
const { db } = require('./database');

const app = express();
app.use(cors());

function handleSearch(query) {
  return db.search(query);
}

app.get('/search', (req, res) => {
  const results = handleSearch(req.query.q);
  res.json(results);
});

module.exports = app;
`,
      'package.json':
        '{"name": "app", "dependencies": {"express": "^4.18.0", "cors": "^2.8.0", "lodash": "^4.17.0"}}',
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'app.js');
      // Lodash should be imported
      expect(content).toContain('lodash');
      // Existing imports should still be there
      expect(content).toContain('express');
      expect(content).toContain('cors');
      expect(content).toContain('database');
      // debounce should be used
      expect(content).toContain('debounce');
    },
  });

  /**
   * When asked to move a function to a different file, the agent should
   * remove it from the source and add it to the target, updating imports.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should move a function between files and update imports',
    prompt:
      'Move the validateInput function from app.js to validation.js and update the import in app.js.',
    files: {
      'app.js': `
function validateInput(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input');
  }
  return input.trim();
}

function processRequest(req) {
  const clean = validateInput(req.body.data);
  return { result: clean.toUpperCase() };
}

module.exports = { processRequest };
`,
    },
    assert: async (rig) => {
      const app = readFileOrFail(rig, 'app.js');
      // validateInput should be imported, not defined inline
      expect(app).not.toMatch(/function validateInput/);
      expect(app).toContain('validateInput');
      expect(app).toContain('processRequest');

      // validation.js should exist with the function
      const validation = readFileOrFail(rig, 'validation.js');
      expect(validation).toContain('validateInput');
    },
  });
});
