#!/usr/bin/env node
/**
 * Chat-to-Eval Converter
 *
 * Converts a Gemini CLI activity log (JSONL) into a skeleton eval test case.
 * The generated test includes the user prompt, any file context, and assertion
 * stubs based on the tool calls observed in the log.
 *
 * Usage:
 *   node scripts/chat-to-eval.mjs <activity-log.jsonl> [--name <eval-name>]
 *
 * The output is a TypeScript eval skeleton printed to stdout. The contributor
 * reviews it, fills in specific assertions, and saves it as a .eval.ts file.
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const logFile = args.find((a) => !a.startsWith('--'));
  const nameIdx = args.indexOf('--name');
  const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;

  if (!logFile) {
    console.error('Usage: node scripts/chat-to-eval.mjs <activity-log.jsonl> [--name <eval-name>]');
    process.exit(1);
  }

  return { logFile, name };
}

function parseJSONL(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const entries = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

function extractPrompt(entries) {
  // Look for user message events
  for (const entry of entries) {
    if (entry['event.name'] === 'user_message' || entry.role === 'user') {
      return entry.content || entry.message || entry.prompt || null;
    }
    // Also check for prompt in run metadata
    if (entry.prompt) {
      return entry.prompt;
    }
  }
  return null;
}

function extractToolCalls(entries) {
  const toolCalls = [];

  for (const entry of entries) {
    if (entry['event.name'] === 'tool_call' || entry.toolRequest) {
      const req = entry.toolRequest || entry;
      toolCalls.push({
        name: req.name || entry['tool.name'] || 'unknown',
        args: req.args || entry['tool.args'] || '{}',
        success: req.success !== undefined ? req.success : true,
      });
    }
  }

  return toolCalls;
}

function generateEvalSkeleton(prompt, toolCalls, name) {
  const evalName = name || 'generated_eval';
  const safePrompt = prompt ? prompt.replace(/'/g, "\\'").replace(/\n/g, '\\n') : 'TODO: add prompt';

  // Group tool calls for assertions
  const toolGroups = {};
  for (const call of toolCalls) {
    if (!toolGroups[call.name]) {
      toolGroups[call.name] = [];
    }
    toolGroups[call.name].push(call);
  }

  // Build assertion code
  let assertions = '';
  if (Object.keys(toolGroups).length > 0) {
    assertions += `      const toolLogs = rig.readToolLogs();\n\n`;
    for (const [toolName, calls] of Object.entries(toolGroups)) {
      const varName = toolName.replace(/[^a-zA-Z0-9]/g, '_') + 'Calls';
      assertions += `      // ${toolName} was called ${calls.length} time(s) in the original session\n`;
      assertions += `      const ${varName} = toolLogs.filter(\n`;
      assertions += `        (log) => log.toolRequest.name === '${toolName}',\n`;
      assertions += `      );\n`;
      assertions += `      expect(\n`;
      assertions += `        ${varName}.length,\n`;
      assertions += `        'Expected agent to call ${toolName}',\n`;
      assertions += `      ).toBeGreaterThanOrEqual(1);\n\n`;
    }
  } else {
    assertions += `      // TODO: No tool calls detected in log. Add assertions manually.\n`;
    assertions += `      const toolLogs = rig.readToolLogs();\n`;
    assertions += `      expect(toolLogs.length).toBeGreaterThan(0);\n`;
  }

  return `/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated eval skeleton from chat log.
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('${evalName}', () => {
  evalTest('USUALLY_PASSES', {
    name: '${evalName}',
    prompt: '${safePrompt}',
    files: {
      // TODO: Add file setup that matches the original session context.
      // 'app.ts': \`...\`,
    },
    assert: async (rig) => {
${assertions}    },
  });
});
`;
}

// Main
const { logFile, name } = parseArgs();
const entries = parseJSONL(logFile);
const prompt = extractPrompt(entries);
const toolCalls = extractToolCalls(entries);

console.log(generateEvalSkeleton(prompt, toolCalls, name));

// Print summary to stderr
console.error(`\n--- Summary ---`);
console.error(`Log entries: ${entries.length}`);
console.error(`Prompt: ${prompt ? prompt.substring(0, 80) + '...' : 'not found'}`);
console.error(`Tool calls: ${toolCalls.length}`);
for (const call of toolCalls) {
  console.error(`  - ${call.name} (success: ${call.success})`);
}
