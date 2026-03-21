/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Refactoring', () => {
  /**
   * When asked to extract a function, the agent should create a new function
   * and replace the inline code with a call to it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should extract inline code into a named function',
    prompt:
      'Extract the price calculation logic into a separate calculatePrice function.',
    files: {
      'order.js': `
function processOrder(order) {
  // Complex price calculation
  let price = order.basePrice;
  if (order.discount > 0) {
    price = price * (1 - order.discount / 100);
  }
  if (order.quantity > 10) {
    price = price * 0.95; // bulk discount
  }
  price = Math.round(price * 100) / 100;

  return {
    orderId: order.id,
    finalPrice: price,
    status: 'processed',
  };
}

module.exports = { processOrder };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('order.js');
      expect(content).toContain('calculatePrice');
      expect(content).toContain('processOrder');
      // The extracted function should handle the discount logic
      expect(content).toContain('discount');
    },
  });

  /**
   * When asked to convert callbacks to async/await, the agent should
   * preserve the logic while changing the syntax.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should convert callback-based code to async/await',
    prompt: 'Convert the callback-based code in data.js to use async/await.',
    files: {
      'data.js': `
const fs = require('fs');

function loadConfig(callback) {
  fs.readFile('config.json', 'utf-8', (err, data) => {
    if (err) {
      callback(err, null);
      return;
    }
    try {
      const parsed = JSON.parse(data);
      callback(null, parsed);
    } catch (parseErr) {
      callback(parseErr, null);
    }
  });
}

function saveConfig(config, callback) {
  const json = JSON.stringify(config, null, 2);
  fs.writeFile('config.json', json, (err) => {
    if (err) {
      callback(err);
      return;
    }
    callback(null);
  });
}

module.exports = { loadConfig, saveConfig };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('data.js');
      expect(content).toContain('async');
      expect(content).toContain('await');
      // Should still have both functions
      expect(content).toContain('loadConfig');
      expect(content).toContain('saveConfig');
      // Should use fs.promises or fs/promises
      expect(content).toMatch(/promises|fs\/promises/);
    },
  });

  /**
   * When asked to DRY up repeated code, the agent should identify the
   * duplication and extract it.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should remove code duplication by extracting common logic',
    prompt:
      'The validation logic is duplicated in createUser and updateUser. Extract it into a shared function.',
    files: {
      'users.js': `
function createUser(data) {
  // Validation
  if (!data.name || data.name.length < 2) {
    throw new Error('Name must be at least 2 characters');
  }
  if (!data.email || !data.email.includes('@')) {
    throw new Error('Invalid email address');
  }
  if (!data.age || data.age < 18) {
    throw new Error('Must be at least 18 years old');
  }

  return { id: Date.now(), ...data, createdAt: new Date() };
}

function updateUser(id, data) {
  // Same validation
  if (!data.name || data.name.length < 2) {
    throw new Error('Name must be at least 2 characters');
  }
  if (!data.email || !data.email.includes('@')) {
    throw new Error('Invalid email address');
  }
  if (!data.age || data.age < 18) {
    throw new Error('Must be at least 18 years old');
  }

  return { id, ...data, updatedAt: new Date() };
}

module.exports = { createUser, updateUser };
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('users.js');

      // Should have a shared validation function
      expect(content).toMatch(/validate|Validate/);

      // Both original functions should still exist
      expect(content).toContain('createUser');
      expect(content).toContain('updateUser');

      // The validation logic should appear only once (in the shared function)
      const nameChecks = (content.match(/Name must be at least/g) || []).length;
      expect(
        nameChecks,
        'Validation string should appear only once (in shared function)',
      ).toBe(1);
    },
  });

  /**
   * When asked to add TypeScript types to a JavaScript file, the agent
   * should add type annotations without changing behavior.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add TypeScript types without changing behavior',
    prompt:
      'Convert utils.js to TypeScript with proper type annotations. Save as utils.ts.',
    files: {
      'utils.js': `
function greet(name) {
  return 'Hello, ' + name + '!';
}

function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

function pick(obj, keys) {
  const result = {};
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

module.exports = { greet, sum, pick };
`,
      'tsconfig.json':
        '{"compilerOptions": {"strict": true, "target": "ES2020"}}',
    },
    assert: async (rig) => {
      const content = rig.readFile('utils.ts');
      expect(content).toBeDefined();

      // Should have type annotations
      expect(content).toMatch(/:\s*(string|number|Record|object)/);
      // All functions should still exist
      expect(content).toContain('greet');
      expect(content).toContain('sum');
      expect(content).toContain('pick');
    },
  });
});
