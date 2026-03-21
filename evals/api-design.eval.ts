/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('API Design', () => {
  /**
   * When asked to add a REST endpoint, the agent should follow existing
   * route patterns in the codebase.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should follow existing route patterns when adding endpoints',
    prompt:
      'Add a DELETE /api/users/:id endpoint to routes.js following the existing pattern.',
    files: {
      'routes.js': `
const express = require('express');
const router = express.Router();

router.get('/api/users', async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({ data: users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/users/:id', async (req, res) => {
  try {
    const user = await db.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('routes.js');
      // Should have a delete route
      expect(content).toMatch(/router\.delete|app\.delete/);
      // Should follow the same error handling pattern
      expect(content).toContain('try');
      expect(content).toContain('catch');
      // Should follow the same response format
      expect(content).toMatch(/res\.json|res\.status/);
      // Existing routes should be preserved
      expect(content).toContain('getUsers');
      expect(content).toContain('getUser');
    },
  });

  /**
   * When asked to add input validation to an endpoint, the agent should
   * validate before processing.
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add input validation to API endpoint',
    prompt:
      'Add input validation to the POST /api/users endpoint. Name and email are required.',
    files: {
      'routes.js': `
const express = require('express');
const router = express.Router();

router.post('/api/users', async (req, res) => {
  const user = await db.createUser(req.body);
  res.status(201).json({ data: user });
});

module.exports = router;
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('routes.js');
      // Should validate before creating
      expect(content).toMatch(/name|email/);
      expect(content).toMatch(/400|validation|required|missing/i);
      // Should still create users with valid input
      expect(content).toContain('createUser');
    },
  });

  /**
   * When asked to add middleware, the agent should add it in the right
   * position (before route handlers).
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add middleware before route handlers',
    prompt:
      'Add a request logging middleware that logs the method and URL of every request.',
    files: {
      'app.js': `
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);

module.exports = app;
`,
      'routes.js': `
const router = require('express').Router();
router.get('/health', (req, res) => res.json({ status: 'ok' }));
module.exports = router;
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('app.js');
      // Should have logging middleware
      expect(content).toMatch(/log|console\./);
      // Middleware should appear before route mounting
      const logIndex = content.search(/log|console\./);
      const routeIndex = content.indexOf("app.use('/api'");
      if (logIndex !== -1 && routeIndex !== -1) {
        expect(logIndex).toBeLessThan(routeIndex);
      }
    },
  });

  /**
   * When asked to add error handling middleware, the agent should add it
   * after routes (Express convention).
   */
  evalTest('USUALLY_PASSES', {
    name: 'should add error handler after routes',
    prompt: 'Add a global error handling middleware to app.js.',
    files: {
      'app.js': `
const express = require('express');
const routes = require('./routes');

const app = express();
app.use(express.json());
app.use('/api', routes);

module.exports = app;
`,
      'routes.js': `
const router = require('express').Router();
router.get('/health', (req, res) => res.json({ status: 'ok' }));
module.exports = router;
`,
    },
    assert: async (rig) => {
      const content = rig.readFile('app.js');
      // Should have error middleware (4 params: err, req, res, next)
      expect(content).toMatch(/err.*req.*res.*next|error/);
      // Error handler should be after routes
      const routeIndex = content.indexOf("app.use('/api'");
      const errorIndex = content.search(/err.*req.*res.*next/);
      if (routeIndex !== -1 && errorIndex !== -1) {
        expect(errorIndex).toBeGreaterThan(routeIndex);
      }
    },
  });
});
