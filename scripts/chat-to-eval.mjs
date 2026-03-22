#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chat-to-Eval Converter — Benchmark Generation Pipeline
 *
 * Converts Gemini CLI eval run logs into typed behavioral eval test cases,
 * applying quality scoring, deduplication, and complexity classification.
 *
 * Modes:
 *   --scan               Scan all logs, output quality/complexity report
 *   --generate <file>    Generate a TypeScript eval from a specific log file
 *   --batch              Generate evals for all high-quality, non-duplicate logs
 *   --min-quality <n>    Minimum quality score for --batch (default: 50)
 *   --name <name>        Eval name override for --generate
 *   --help               Show this help
 *
 * Usage:
 *   node scripts/chat-to-eval.mjs --scan
 *   node scripts/chat-to-eval.mjs --generate evals/logs/should_use_grep.log
 *   node scripts/chat-to-eval.mjs --batch --min-quality 60
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, '../evals/logs');
const GENERATED_DIR = path.resolve(__dirname, '../evals/generated');

// Canonical tool names. Never use aliases (ls, web_search, edit).
const TOOL_NAMES = {
  list_directory: 'list_directory',
  grep_search: 'grep_search',
  read_file: 'read_file',
  read_many_files: 'read_many_files',
  write_file: 'write_file',
  replace: 'replace',
  run_shell_command: 'run_shell_command',
  web_fetch: 'web_fetch',
  google_web_search: 'google_web_search',
  save_memory: 'save_memory',
  glob: 'glob',
};

const WRITE_TOOLS = new Set(['write_file', 'replace']);
const WEB_TOOLS = new Set(['google_web_search', 'web_fetch']);
const SHELL_TOOLS = new Set(['run_shell_command']);
const SEARCH_TOOLS = new Set(['grep_search', 'glob', 'list_directory']);

/**
 * Read and parse a .log file (JSON array of tool call records).
 * @param {string} filePath
 * @returns {{toolRequest: {name: string, args: string, success: boolean, duration_ms: number}}[]}
 */
function readLogFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Convert a snake_case log filename to a human-readable prompt string.
 * e.g. should_use_grep_over_reading_all_files -> should use grep over reading all files
 * @param {string} filename
 * @returns {string}
 */
function filenameToPrompt(filename) {
  return path.basename(filename, '.log').replace(/_/g, ' ');
}

/**
 * Extract tool call statistics from a log.
 * @param {object[]} entries
 */
function analyzeLog(entries) {
  const toolNames = entries.map((e) => e.toolRequest?.name).filter(Boolean);
  const uniqueTools = new Set(toolNames);
  const totalDuration = entries.reduce(
    (sum, e) => sum + (e.toolRequest?.duration_ms || 0),
    0,
  );
  const hasWrite = toolNames.some((t) => WRITE_TOOLS.has(t));
  const hasWeb = toolNames.some((t) => WEB_TOOLS.has(t));
  const hasShell = toolNames.some((t) => SHELL_TOOLS.has(t));
  const hasSearch = toolNames.some((t) => SEARCH_TOOLS.has(t));
  const hasFailure = entries.some((e) => e.toolRequest?.success === false);

  return {
    toolNames,
    uniqueTools: [...uniqueTools],
    totalCalls: toolNames.length,
    totalDuration,
    hasWrite,
    hasWeb,
    hasShell,
    hasSearch,
    hasFailure,
  };
}

/**
 * Compute complexity level based on tool usage.
 * @param {object} stats
 * @returns {'L1'|'L2'|'L3'}
 */
function computeComplexity(stats) {
  if (stats.totalCalls > 6 || (stats.hasWeb && stats.hasShell)) return 'L3';
  if (stats.totalCalls >= 3 || stats.uniqueTools.length > 2) return 'L2';
  return 'L1';
}

/**
 * Compute quality score (0-100) for a log.
 * @param {object} stats
 * @returns {number}
 */
function computeQuality(stats) {
  let score = 0;
  // Non-trivial tool sequence
  if (stats.uniqueTools.length > 1) score += 25;
  // Has verifiable write outcomes
  if (stats.hasWrite) score += 25;
  // Meaningful number of tool calls
  if (stats.totalCalls > 2) score += 25;
  // Complexity bonus (richer scenarios are more valuable)
  if (stats.totalCalls > 4) score += 15;
  if (stats.hasSearch && stats.hasWrite) score += 10;
  return Math.min(score, 100);
}

/**
 * Compute Jaccard similarity between two tool name arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0-1
 */
function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find duplicate log files by tool name Jaccard similarity.
 * @param {Map<string, object>} statsMap filename -> stats
 * @returns {Set<string>} filenames that are near-duplicates of an earlier file
 */
function findDuplicates(statsMap) {
  const files = [...statsMap.keys()];
  const duplicates = new Set();

  for (let i = 0; i < files.length; i++) {
    if (duplicates.has(files[i])) continue;
    for (let j = i + 1; j < files.length; j++) {
      if (duplicates.has(files[j])) continue;
      const sim = jaccardSimilarity(
        statsMap.get(files[i]).toolNames,
        statsMap.get(files[j]).toolNames,
      );
      if (sim >= 0.8) {
        duplicates.add(files[j]);
      }
    }
  }

  return duplicates;
}

/**
 * Generate TypeScript assertion code from tool call statistics.
 * @param {object} stats
 * @param {object[]} entries raw log entries
 * @returns {string}
 */
function generateAssertions(stats, entries) {
  const lines = ['      const toolLogs = rig.readToolLogs();'];

  // Group by tool name with counts
  const counts = {};
  for (const name of stats.toolNames) {
    counts[name] = (counts[name] || 0) + 1;
  }

  if (stats.hasSearch) {
    const searchTools = Object.keys(counts).filter((t) => SEARCH_TOOLS.has(t));
    for (const tool of searchTools) {
      const varName = tool.replace(/_/g, '') + 'Calls';
      lines.push(`      const ${varName} = toolLogs.filter(`);
      lines.push(`        (log) => log.toolRequest.name === '${tool}',`);
      lines.push(`      );`);
      lines.push(
        `      expect(${varName}.length, 'Expected ${tool} call').toBeGreaterThanOrEqual(1);`,
      );
    }
  }

  if (stats.hasWeb) {
    const webTools = Object.keys(counts).filter((t) => WEB_TOOLS.has(t));
    for (const tool of webTools) {
      const varName = tool.replace(/_/g, '') + 'Calls';
      lines.push(`      const ${varName} = toolLogs.filter(`);
      lines.push(`        (log) => log.toolRequest.name === '${tool}',`);
      lines.push(`      );`);
      lines.push(
        `      expect(${varName}.length, 'Expected ${tool} call').toBeGreaterThanOrEqual(1);`,
      );
    }
  }

  if (stats.hasWrite) {
    lines.push(`      const writeOps = toolLogs.filter(`);
    lines.push(
      `        (log) => log.toolRequest.name === 'write_file' || log.toolRequest.name === 'replace',`,
    );
    lines.push(`      );`);
    lines.push(
      `      expect(writeOps.length, 'Expected file write or replace').toBeGreaterThanOrEqual(1);`,
    );

    // Try to extract the written filename from args
    for (const entry of entries) {
      const name = entry.toolRequest?.name;
      if (name === 'write_file' || name === 'replace') {
        try {
          const args = JSON.parse(entry.toolRequest.args);
          const filePath = args.file_path || args.path;
          if (filePath && !filePath.startsWith('/')) {
            lines.push(`      // Verify the file was actually modified`);
            lines.push(`      const content = rig.readFile('${filePath}');`);
            lines.push(
              `      expect(content.length, 'File ${filePath} should have content').toBeGreaterThan(0);`,
            );
            break;
          }
        } catch {
          // skip unparseable args
        }
      }
    }
  }

  if (lines.length === 1) {
    // Fallback: at least one tool was called
    lines.push(
      `      expect(toolLogs.length, 'Agent should have made tool calls').toBeGreaterThan(0);`,
    );
  }

  return lines.join('\n');
}

/**
 * Generate a TypeScript evalTest from a log file.
 * @param {string} logFile path to .log file
 * @param {string} [name] override eval name
 * @returns {string} TypeScript source
 */
function generateEval(logFile, name) {
  const entries = readLogFile(logFile);
  const stats = analyzeLog(entries);
  const complexity = computeComplexity(stats);
  const quality = computeQuality(stats);
  const prompt = filenameToPrompt(logFile);
  const evalName = name || prompt;
  const assertions = generateAssertions(stats, entries);

  return `/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto-generated from eval run log via scripts/chat-to-eval.mjs
 * Complexity: ${complexity} | Quality score: ${quality}/100
 * Tool sequence: ${stats.toolNames.join(' → ')}
 * Review and adjust assertions before submitting.
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('${evalName}', () => {
  evalTest('USUALLY_PASSES', {
    name: '${evalName}',
    // minToolCalls observed in original run: ${stats.totalCalls}
    prompt: '${prompt}',
    files: {
      // TODO: Add file setup matching original session context
    },
    assert: async (rig) => {
${assertions}
    },
  });
});
`;
}

// ---- CLI ----

function printHelp() {
  console.log(`
Chat-to-Eval Converter — Benchmark Generation Pipeline

Modes:
  --scan               Scan all logs, print quality/complexity report
  --generate <file>    Generate TypeScript eval from a log file
  --batch              Generate evals for high-quality non-duplicate logs
  --min-quality <n>    Minimum quality for --batch (default: 50)
  --name <name>        Eval name for --generate
  --help               Show this help

Examples:
  node scripts/chat-to-eval.mjs --scan
  node scripts/chat-to-eval.mjs --generate evals/logs/should_use_grep.log
  node scripts/chat-to-eval.mjs --batch --min-quality 60
`);
}

function runScan() {
  const logFiles = fs
    .readdirSync(LOGS_DIR)
    .filter((f) => f.endsWith('.log'))
    .map((f) => path.join(LOGS_DIR, f));

  if (logFiles.length === 0) {
    console.log('No .log files found in evals/logs/');
    return;
  }

  const statsMap = new Map();
  for (const file of logFiles) {
    const entries = readLogFile(file);
    statsMap.set(file, analyzeLog(entries));
  }

  const duplicates = findDuplicates(statsMap);

  console.log(`# Eval Log Analysis Report\n`);
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log(
    `| Eval Name | Complexity | Quality | Tools | Calls | Duplicate |`,
  );
  console.log(`|---|---|---|---|---|---|`);

  let totalGenerable = 0;
  for (const [file, stats] of statsMap.entries()) {
    const name = path.basename(file, '.log');
    const complexity = computeComplexity(stats);
    const quality = computeQuality(stats);
    const isDup = duplicates.has(file) ? 'YES' : '-';
    const toolSummary = stats.uniqueTools.join(', ') || 'none';
    if (!duplicates.has(file) && quality >= 50) totalGenerable++;
    console.log(
      `| ${name} | ${complexity} | ${quality} | ${toolSummary} | ${stats.totalCalls} | ${isDup} |`,
    );
  }

  console.log(`\n## Summary`);
  console.log(`- Total logs: ${logFiles.length}`);
  console.log(`- Duplicates: ${duplicates.size}`);
  console.log(`- Generable (quality >= 50, not duplicate): ${totalGenerable}`);
}

function runGenerate(logFile, name) {
  if (!fs.existsSync(logFile)) {
    console.error(`File not found: ${logFile}`);
    process.exit(1);
  }
  console.log(generateEval(logFile, name));
}

function runBatch(minQuality) {
  const logFiles = fs
    .readdirSync(LOGS_DIR)
    .filter((f) => f.endsWith('.log'))
    .map((f) => path.join(LOGS_DIR, f));

  const statsMap = new Map();
  for (const file of logFiles) {
    const entries = readLogFile(file);
    statsMap.set(file, analyzeLog(entries));
  }

  const duplicates = findDuplicates(statsMap);
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  let generated = 0;
  let skippedQuality = 0;
  let skippedDuplicate = 0;

  for (const [file, stats] of statsMap.entries()) {
    const quality = computeQuality(stats);
    if (duplicates.has(file)) {
      skippedDuplicate++;
      continue;
    }
    if (quality < minQuality) {
      skippedQuality++;
      continue;
    }
    const outName =
      path.basename(file, '.log') + '.generated.eval.ts';
    const outPath = path.join(GENERATED_DIR, outName);
    fs.writeFileSync(outPath, generateEval(file));
    generated++;
    console.error(`Generated: ${outPath} (quality: ${quality})`);
  }

  console.error(
    `\nDone: ${generated} generated, ${skippedQuality} skipped (low quality), ${skippedDuplicate} skipped (duplicate)`,
  );
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  printHelp();
} else if (args.includes('--scan')) {
  runScan();
} else if (args.includes('--generate')) {
  const fileIdx = args.indexOf('--generate') + 1;
  const logFile = args[fileIdx];
  const nameIdx = args.indexOf('--name');
  const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;
  runGenerate(logFile, name);
} else if (args.includes('--batch')) {
  const mqIdx = args.indexOf('--min-quality');
  const minQuality = mqIdx !== -1 ? parseInt(args[mqIdx + 1], 10) : 50;
  runBatch(minQuality);
} else {
  // Legacy mode: treat first arg as log file
  const logFile = args.find((a) => !a.startsWith('--'));
  const nameIdx = args.indexOf('--name');
  const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;
  if (logFile) {
    runGenerate(logFile, name);
  } else {
    printHelp();
  }
}
