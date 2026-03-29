# Coverage Report: Field Reference

## Summary Block

```
- Eval files: 16          # number of .eval.ts files in evals/
- Total tests: 77         # total evalTest() calls across all files
- ALWAYS_PASSES: 0        # deterministic tests (code-path driven, failures are bugs)
- USUALLY_PASSES: 77      # model-dependent tests (failures are quality signals)
- Tools with evals: 11/18 # how many core tools appear in at least one assertion
- Tools without evals: 7  # tools with zero behavioral coverage
```

## Tool Coverage Matrix

Each row shows one core tool:

| Column | Meaning |
|--------|---------|
| Tool | Tool name as defined in `base-declarations.ts` |
| Eval Files | Which `.eval.ts` files reference this tool in assertions |
| Tests | Total `evalTest()` calls that assert on this tool |
| Status | `Covered` = at least 1 test; `MISSING` = zero tests |

Note: a tool appearing in a prompt does not count as covered. Only tools
explicitly checked in `assert` functions count as covered.

## Policy Breakdown

- **ALWAYS_PASSES**: The behavior is determined by code paths, not model
  output. If this fails, it is a regression. Appropriate for hook sequencing,
  config propagation, tool restriction enforcement.
- **USUALLY_PASSES**: The behavior depends on what the model generates.
  Failures are quality signals, not hard bugs. Run nightly and tracked
  statistically. All new evals start here.

## What Counts as Coverage

A tool is counted as covered if its name constant (e.g., `WRITE_FILE_TOOL_NAME`,
`'write_file'`) appears inside an `assert` function body in any eval file.
Tools only referenced in prompts or workspace setup do not count.
