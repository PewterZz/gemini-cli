/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest, readFileOrFail } from './test-helper.js';

describe('Performance Patterns', () => {
  /**
   * When asked to optimize a function, the agent should identify the
   * actual bottleneck.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should identify O(n^2) bottleneck and suggest improvement',
    prompt: 'This function is slow for large arrays. Optimize it.',
    files: {
      'search.js': `
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}

module.exports = { findDuplicates };
`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'search.js');
      // Should use a Set or Map for O(n) solution
      expect(content).toMatch(/Set|Map|has\(|new Set/);
      expect(content).toContain('findDuplicates');
    },
  });

  /**
   * When asked to add caching, the agent should implement memoization
   * correctly.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add memoization to a pure function',
    prompt: 'Add caching to the fibonacci function to improve performance.',
    files: {
      'math.js': `
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

module.exports = { fibonacci };
`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'math.js');
      expect(content).toContain('fibonacci');
      // Should have some form of caching
      expect(content).toMatch(/cache|memo|Map|Object\.create|{}/);
    },
  });

  /**
   * When asked to optimize database queries, the agent should not just
   * refactor code but address the actual query pattern.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should fix N+1 query pattern',
    prompt: 'This has an N+1 query problem. Fix it.',
    files: {
      'users.js': `
async function getUsersWithPosts(db) {
  const users = await db.query('SELECT * FROM users');
  for (const user of users) {
    user.posts = await db.query('SELECT * FROM posts WHERE user_id = ?', [user.id]);
  }
  return users;
}

module.exports = { getUsersWithPosts };
`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'users.js');
      // Should use a JOIN or batch query instead of loop
      expect(content).toMatch(/JOIN|IN\s*\(|Promise\.all/i);
      expect(content).toContain('getUsersWithPosts');
    },
  });

  /**
   * When asked to handle large data, the agent should suggest streaming
   * rather than loading everything into memory.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should suggest streaming for large file processing',
    prompt:
      'This crashes on large files because it loads everything into memory. Fix it.',
    files: {
      'csv-parser.js': `
const fs = require('fs');

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i]; });
    return row;
  });
  return rows;
}

module.exports = { parseCSV };
`,
    },
    assert: async (rig) => {
      const content = readFileOrFail(rig, 'csv-parser.js');
      // Should use streaming or chunked reading
      expect(content).toMatch(/createReadStream|readline|stream|pipe|chunk/i);
      expect(content).toContain('parseCSV');
    },
  });
});
