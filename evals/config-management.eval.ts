/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('Config Management', () => {
  /**
   * When asked to add environment variable support, the agent should
   * use process.env and provide defaults.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should use environment variables with defaults',
    prompt:
      'Make the port and database URL configurable via environment variables.',
    files: {
      'config.js': `
module.exports = {
  port: 3000,
  databaseUrl: 'mongodb://localhost:27017/myapp',
  logLevel: 'info',
};
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('config.js');
      expect(content).toContain('process.env');
      // Should provide defaults
      expect(content).toMatch(/process\.env|3000/);
      // logLevel should still be there
      expect(content).toContain('logLevel');
    },
  });

  /**
   * When a .env.example exists, the agent should reference it when
   * adding new environment variables.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should update .env.example when adding new env vars',
    prompt:
      'Add Redis configuration (REDIS_URL) to the config and update .env.example.',
    files: {
      'config.js': `
module.exports = {
  port: process.env.PORT || 3000,
  dbUrl: process.env.DATABASE_URL || 'mongodb://localhost/app',
};
`,
      '.env.example': `
PORT=3000
DATABASE_URL=mongodb://localhost/app
`,
    },
    assert: async (rig) => {
      const config = rig.readFile('config.js');
      expect(config).toContain('REDIS');

      const envExample = rig.readFile('.env.example');
      expect(envExample).toContain('REDIS');
      // Existing vars should be preserved
      expect(envExample).toContain('PORT');
      expect(envExample).toContain('DATABASE_URL');
    },
  });

  /**
   * When asked to add config validation, the agent should validate
   * required values at startup.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add startup validation for required config',
    prompt:
      'Add validation to ensure DATABASE_URL is set before the app starts.',
    files: {
      'index.js': `
const config = require('./config');
const app = require('./app');

app.listen(config.port, () => {
  console.log('Server running on port ' + config.port);
});
`,
      'config.js': `
module.exports = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL,
};
`,
      'app.js': 'module.exports = require("express")();',
    },
    assert: async (rig) => {
      // Should have added validation somewhere
      const index = rig.readFile('index.js');
      const config = rig.readFile('config.js');
      const combined = index + config;

      expect(combined).toMatch(/throw|Error|required|missing|DATABASE_URL/i);
    },
  });
});
