# Validation Results

Per-category pass rates from `evals/logs/results-per-file/`. Collected March
28-31 2026 via Vertex AI. Each test spawns a real Gemini CLI process and asserts
on tool call logs and file mutations.

Missing entries (-) indicate tests that timed out, typically due to
network-dependent assertions or Vertex AI latency variance.

| Category                 | 2.5-lite     | 2.5-flash    | 2.5-pro      | 3-flash      | 3-pro        |
| ------------------------ | ------------ | ------------ | ------------ | ------------ | ------------ |
| agent-behavior           | 10/11 91%    | 10/11 91%    | 7/11 64%     | 10/11 91%    | 10/11 91%    |
| code-review              | 3/5 60%      | 3/5 60%      | 5/5 100%     | 3/5 60%      | 4/5 80%      |
| context-awareness        | 2/5 40%      | 5/5 100%     | 3/5 60%      | 4/5 80%      | 5/5 100%     |
| debugging                | 2/4 50%      | 2/4 50%      | 1/4 25%      | 1/4 25%      | 2/4 50%      |
| edge-cases               | 6/6 100%     | 4/6 67%      | 5/6 83%      | 6/6 100%     | 6/6 100%     |
| error-recovery           | 2/3 67%      | 2/3 67%      | 2/3 67%      | 2/3 67%      | 2/3 67%      |
| l3-advanced              | 3/4 75%      | 1/4 25%      | 2/4 50%      | 3/4 75%      | 4/4 100%     |
| large-codebase           | 1/4 25%      | 1/4 25%      | 1/4 25%      | 2/4 50%      | 2/4 50%      |
| minimal-changes          | 5/6 83%      | 5/6 83%      | 5/6 83%      | 5/6 83%      | 5/6 83%      |
| multi-file-editing       | 2/4 50%      | 1/4 25%      | 3/4 75%      | 3/4 75%      | 2/4 50%      |
| multi-turn               | 1/4 25%      | 4/4 100%     | 2/4 50%      | 3/4 75%      | 3/4 75%      |
| performance-patterns     | 3/5 60%      | 5/5 100%     | 4/5 80%      | 5/5 100%     | 5/5 100%     |
| refactoring              | 0/3 0%       | 1/3 33%      | 2/3 67%      | 1/3 33%      | 2/3 67%      |
| regression-safety        | 2/3 67%      | 2/3 67%      | 2/3 67%      | 2/3 67%      | 1/3 33%      |
| tool-selection           | 5/5 100%     | 4/5 80%      | 3/5 60%      | --           | 5/5 100%     |
| web-tools                | 2/5 40%      | 3/5 60%      | 2/5 40%      | --           | 3/5 60%      |
| ------------------------ | ------------ | ------------ | ------------ | ------------ | ------------ |
| **Total**                | 49/77 63.6%  | 53/77 68.8%  | 49/77 63.6%  | 50/67 74.6%  | 61/77 79.2%  |

## Notes

- `gemini-3-flash-preview` tool-selection and web-tools timed out during re-run
  (March 31). Original snapshot (March 28-30) had 4/4 and 4/4 on the
  pre-expansion test set.
- The proposal table uses the original March 28-30 snapshot (77 tests per model,
  all complete). This file reflects updated runs after 6 categories were
  expanded with harder tests.
- All result JSON files are in `evals/logs/results-per-file/`.
