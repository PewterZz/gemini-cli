# TODO (Next 14 Days)

Last updated: 2026-03-17

## P0 - Must Finish Before Production

- [x] Add CI job coverage for `test:e2e:proxy` across Linux and macOS.
- [x] Define platform policy for Windows for `curl` and Python runtime
      variability.
- Keep proxy subprocess e2e in Linux/macOS CI.
- Do not gate Windows CI on proxy subprocess e2e because runtime/tooling
  availability is less predictable.
- Keep Windows coverage through core unit/integration tests that do not depend
  on `curl` or shell specifics.
- [x] Add proxy telemetry counters and structured reasons:
- `allowed`, `blocked`, `dns_resolution_failed`, `private_ip_blocked`,
  `limit_exceeded`, `timeout`.
- [x] Add regression tests for telemetry counters.
- [x] Add operator runbook section:
- how to enable proxy mode, inspect logs, and debug blocked requests.

## P1 - High Value Security and Reliability

- [x] Add fuzz/property tests for hostname pattern matching and CONNECT target
      parsing.
- [x] Add chaos tests for DNS failures and upstream socket failures with
      repeated churn.
- [ ] Add load test thresholds and fail criteria for stress suite in CI nightly.
- [x] Add explicit tests for proxy header sanitization (`Proxy-Authorization`,
      `Proxy-Connection`).
- [ ] Add validation tests for config bounds and invalid values from settings.

## P2 - Nice to Have

- [ ] Add developer script to run all proxy-related tests in one command.
- [ ] Add a compact architecture diagram in docs for proxy data flow and limits.
- [ ] Add sample secure default config snippets for common allowlist setups.

## Exit Criteria

- [ ] All proxy unit/integration/stress suites pass in CI.
- [ ] No high severity findings remain in proxy/sandbox path review.
- [ ] Runbook and config docs are complete and up to date.
- [ ] Proxy behavior and known limitations are documented for users and
      maintainers.
