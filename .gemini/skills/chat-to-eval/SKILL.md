---
name: chat-to-eval
description:
  Use this skill to convert real Gemini CLI activity logs or chat recordings
  into behavioral eval test cases. Triggers on phrases like "generate an eval
  from this log", "convert my chat session to a test", "create an eval from
  real usage", or "turn this interaction into an eval".
---

# Chat-to-Eval Converter

This skill guides contributors through generating behavioral eval test cases
from real Gemini CLI activity logs and chat recordings.

Real usage logs are the highest-quality source of eval candidates because they
capture actual failure modes users encountered, rather than synthetic scenarios.

## When to Use

- You have a Gemini CLI session log that exposed a behavioral issue
- You want to turn a reported bug into a reproducible eval
- You want to expand eval coverage using real interaction patterns

## How Gemini CLI Logs Work

Gemini CLI writes activity logs to `~/.gemini/tmp/` by default. Each session
produces a JSONL file with tool call records. The format matches what
`ChatRecordingService` produces:

```json
{"toolRequest": {"name": "read_file", "args": "...", "success": true, "duration_ms": 123}}
{"toolRequest": {"name": "write_file", "args": "...", "success": true, "duration_ms": 456}}
```

You can also enable explicit recording with `--record-responses` to capture
model responses alongside tool calls.

## Workflow

### 1. Scan Available Logs

```bash
node scripts/chat-to-eval.mjs --scan
```

This scans all logs in `evals/logs/` and produces a quality report:
- Quality score (0-100) based on tool diversity, duration, write operations
- Complexity classification (L1/L2/L3)
- Duplicate detection (Jaccard similarity against existing evals)

Focus on logs with quality score > 50 and no near-duplicates.

### 2. Generate a Stub

```bash
node scripts/chat-to-eval.mjs --generate evals/logs/<logfile>.log
```

Or generate all high-quality non-duplicate logs at once:

```bash
node scripts/chat-to-eval.mjs --batch --min-quality 60
```

Generated stubs appear in `evals/generated/`. They follow the real
`evalTest(policy, { name, prompt, assert })` API from `evals/test-helper.ts`.

### 3. Review and Harden the Stub

Generated stubs are starting points. Before submitting:

1. **Check the prompt**: Is it minimal? Does it clearly trigger the behavior?
   Remove any unnecessary context.

2. **Check the assertions**: The generator creates basic tool-call checks.
   Add stronger assertions:
   - File content checks: `const content = rig.readFile('src/target.ts')`
   - Sequence checks: verify tools were called in the right order
   - Negative checks: verify the agent did NOT call a tool it should have avoided

3. **Set the right policy**:
   - `ALWAYS_PASSES` if the behavior is code-path-determined (not model-dependent)
   - `USUALLY_PASSES` for model-choice behaviors (default for new evals)

4. **Run it locally**:
   ```bash
   RUN_EVALS=1 GEMINI_MODEL=gemini-2.5-flash npx vitest run \
     --config evals/vitest.config.ts \
     evals/generated/<your-eval>.eval.ts
   ```

5. **Run it 3 times**: USUALLY_PASSES evals should pass consistently.
   If it fails randomly, the prompt or assertions need refinement.

### 4. Move to evals/ and Submit

Once the eval passes consistently, move it from `evals/generated/` to `evals/`
and add it to the appropriate category file or create a new one if needed.

## Quality Score Explained

| Score | Meaning |
|-------|---------|
| 0-30  | Low quality: too short, single tool, no writes |
| 30-60 | Medium quality: usable but may need significant hardening |
| 60-80 | Good quality: solid foundation, light hardening needed |
| 80+   | High quality: may be ready with minor assertion additions |

## Complexity Levels

- **L1**: Single-step, single tool, clear outcome
- **L2**: Multi-step, multiple tools, clear sequence
- **L3**: Multi-turn, conditional behavior, or cross-file reasoning

New contributors should start with L1/L2. L3 evals are harder to make
deterministic and require more validation runs.
