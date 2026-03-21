#!/usr/bin/env node
/**
 * Eval Coverage Report
 *
 * Scans the eval suite and tool definitions to produce a coverage matrix
 * showing which tools have behavioral evals and which do not.
 *
 * Usage: node scripts/eval-coverage.mjs [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// All core tool names from the tool definitions
const TOOL_NAMES = [
  'activate_skill',
  'ask_user',
  'edit',
  'enter_plan_mode',
  'exit_plan_mode',
  'get_internal_docs',
  'glob',
  'grep_search',
  'ls',
  'read_file',
  'read_many_files',
  'replace',
  'run_shell_command',
  'save_memory',
  'web_fetch',
  'web_search',
  'write_file',
  'write_todos',
];

function scanEvalFiles() {
  const evalsDir = path.join(ROOT, 'evals');
  const evalFiles = fs.readdirSync(evalsDir).filter(f => f.endsWith('.eval.ts'));

  const results = [];

  for (const file of evalFiles) {
    const content = fs.readFileSync(path.join(evalsDir, file), 'utf-8');

    // Count eval tests by policy
    const alwaysPasses = (content.match(/evalTest\(\s*'ALWAYS_PASSES'/g) || []).length;
    const usuallyPasses = (content.match(/evalTest\(\s*'USUALLY_PASSES'/g) || []).length;

    // Find tool names referenced in assertions
    const toolsReferenced = new Set();
    for (const tool of TOOL_NAMES) {
      // Match direct string references like 'run_shell_command'
      if (content.includes(`'${tool}'`) || content.includes(`"${tool}"`)) {
        toolsReferenced.add(tool);
      }
    }

    // Check for EDIT_TOOL_NAMES (covers edit + replace)
    if (content.includes('EDIT_TOOL_NAMES')) {
      toolsReferenced.add('edit');
      toolsReferenced.add('replace');
    }

    // Check for READ_FILE_TOOL_NAME imports
    if (content.includes('READ_FILE_TOOL_NAME')) {
      toolsReferenced.add('read_file');
    }
    if (content.includes('READ_MANY_FILES_TOOL_NAME')) {
      toolsReferenced.add('read_many_files');
    }
    if (content.includes('WRITE_FILE_TOOL_NAME')) {
      toolsReferenced.add('write_file');
    }
    if (content.includes('GREP_TOOL_NAME')) {
      toolsReferenced.add('grep_search');
    }
    if (content.includes('MEMORY_TOOL_NAME')) {
      toolsReferenced.add('save_memory');
    }
    if (content.includes('WEB_SEARCH_TOOL_NAME')) {
      toolsReferenced.add('web_search');
    }
    if (content.includes('WEB_FETCH_TOOL_NAME')) {
      toolsReferenced.add('web_fetch');
    }
    if (content.includes('SHELL_TOOL_NAME')) {
      toolsReferenced.add('run_shell_command');
    }
    if (content.includes('ACTIVATE_SKILL_TOOL_NAME')) {
      toolsReferenced.add('activate_skill');
    }
    if (content.includes('EXIT_PLAN_MODE_TOOL_NAME')) {
      toolsReferenced.add('exit_plan_mode');
    }
    if (content.includes('ENTER_PLAN_MODE_TOOL_NAME')) {
      toolsReferenced.add('enter_plan_mode');
    }

    results.push({
      file: file.replace('.eval.ts', ''),
      alwaysPasses,
      usuallyPasses,
      total: alwaysPasses + usuallyPasses,
      tools: [...toolsReferenced].sort(),
    });
  }

  return results;
}

function buildCoverageMatrix(evalResults) {
  const toolCoverage = {};
  for (const tool of TOOL_NAMES) {
    toolCoverage[tool] = {
      evalFiles: [],
      totalTests: 0,
      alwaysPasses: 0,
      usuallyPasses: 0,
    };
  }

  for (const result of evalResults) {
    for (const tool of result.tools) {
      if (toolCoverage[tool]) {
        toolCoverage[tool].evalFiles.push(result.file);
        toolCoverage[tool].totalTests += result.total;
        toolCoverage[tool].alwaysPasses += result.alwaysPasses;
        toolCoverage[tool].usuallyPasses += result.usuallyPasses;
      }
    }
  }

  return toolCoverage;
}

function printReport(evalResults, toolCoverage) {
  const totalEvals = evalResults.reduce((sum, r) => sum + r.total, 0);
  const totalAlways = evalResults.reduce((sum, r) => sum + r.alwaysPasses, 0);
  const totalUsually = evalResults.reduce((sum, r) => sum + r.usuallyPasses, 0);

  console.log('# Gemini CLI Behavioral Eval Coverage Report\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  // Summary
  console.log('## Summary\n');
  console.log(`- Eval files: ${evalResults.length}`);
  console.log(`- Total tests: ${totalEvals}`);
  console.log(`- ALWAYS_PASSES: ${totalAlways}`);
  console.log(`- USUALLY_PASSES: ${totalUsually}`);

  const covered = Object.values(toolCoverage).filter(t => t.evalFiles.length > 0).length;
  const uncovered = TOOL_NAMES.length - covered;
  console.log(`- Tools with evals: ${covered}/${TOOL_NAMES.length}`);
  console.log(`- Tools without evals: ${uncovered}\n`);

  // Tool coverage table
  console.log('## Tool Coverage\n');
  console.log('| Tool | Eval Files | Tests | Status |');
  console.log('|------|-----------|-------|--------|');

  for (const tool of TOOL_NAMES) {
    const cov = toolCoverage[tool];
    const status = cov.evalFiles.length > 0 ? 'Covered' : 'MISSING';
    const files = cov.evalFiles.length > 0 ? cov.evalFiles.join(', ') : '-';
    console.log(`| ${tool} | ${files} | ${cov.totalTests} | ${status} |`);
  }

  // Uncovered tools
  const missing = TOOL_NAMES.filter(t => toolCoverage[t].evalFiles.length === 0);
  if (missing.length > 0) {
    console.log('\n## Uncovered Tools\n');
    console.log('The following tools have no behavioral eval coverage:\n');
    for (const tool of missing) {
      console.log(`- ${tool}`);
    }
  }

  // Eval file summary
  console.log('\n## Eval Files\n');
  console.log('| File | ALWAYS | USUALLY | Total | Tools Tested |');
  console.log('|------|--------|---------|-------|-------------|');
  for (const r of evalResults.sort((a, b) => b.total - a.total)) {
    const tools = r.tools.length > 0 ? r.tools.join(', ') : '(behavioral only)';
    console.log(`| ${r.file} | ${r.alwaysPasses} | ${r.usuallyPasses} | ${r.total} | ${tools} |`);
  }
}

// Main
const evalResults = scanEvalFiles();
const toolCoverage = buildCoverageMatrix(evalResults);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ evalResults, toolCoverage }, null, 2));
} else {
  printReport(evalResults, toolCoverage);
}
