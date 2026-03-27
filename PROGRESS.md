# GSoC Proxy Hardening Progress

Last updated: 2026-03-17

## Goal

Production-readiness hardening for the network proxy and sandbox manager paths
in `gemini-cli`.

## Completed

- [x] DNS rebinding protection with public-IP selection and connect-by-IP flow.
- [x] IPv4 and IPv6 private range blocking (`RFC1918`, loopback, link-local,
      ULA).
- [x] HTTP and CONNECT request validation hardening.
- [x] Block raw IP targets by policy, except explicit local no-proxy addresses.
- [x] Connection limits, request size limits, upstream timeout limits.
- [x] Bounded in-memory request logs (`maxLogEntries`, including disable mode).
- [x] Structured proxy metrics counters by reason and method (`allowed`,
      `blocked`, `dns_resolution_failed`, `private_ip_blocked`,
      `limit_exceeded`, `timeout`).
- [x] NO_PROXY merge behavior with deduplication and support for both `NO_PROXY`
      and `no_proxy`.
- [x] Sandbox manager lifecycle hardening (`dispose` idempotency, startup retry,
      dispose/start race handling).
- [x] Trailing-dot hostname normalization to prevent allowlist/denylist bypass.
- [x] Test hooks for deterministic DNS/upstream behavior in unit tests.
- [x] Stress tests for repeated startup/shutdown and blocked-request churn.
- [x] Subprocess integration tests for real client behavior:
- `curl` is proxy-enforced.
- `python requests` is proxy-enforced (when runtime and package exist).
- `node:http` bypass limitation is verified and documented.
- [x] CI wiring for proxy subprocess e2e on Linux/macOS (`test:e2e:proxy` in
      `others` shard).
- [x] Windows policy documented: do not gate on proxy subprocess e2e; rely on
      portable core tests.
- [x] Regression tests for metrics counters across DNS failures, private-IP
      blocks, connection limits, and timeout paths.
- [x] Property-based/fuzz tests for hostname pattern matching and CONNECT
      authority parsing.
- [x] Explicit regression tests for upstream proxy-header sanitization
      (`Proxy-Connection`, `Proxy-Authorization`, `Proxy-Authenticate`).
- [x] Chaos tests for alternating DNS failures/private-IP resolutions and
      upstream request failures under churn.
- [x] CLI/core settings schema and config plumbing for proxy parameters.
- [x] Settings docs and generated schema updates.

## Validation Snapshot

- `npm run lint --workspace @google/gemini-cli-core` passed.
- `npm run typecheck --workspace @google/gemini-cli-core` passed.
- `npm run test --workspace @google/gemini-cli-core -- src/services/networkProxy.test.ts src/services/networkProxy.subprocess.integration.test.ts src/services/sandboxManager.test.ts src/config/sandbox-integration.test.ts`
  passed (82/82).
- `npm run test:stress --workspace @google/gemini-cli-core` passed (3/3).
- `npm run test:e2e:proxy` passed.

## Known Constraint

`SandboxManager.prepareCommand()` enforces env-based proxying for child
processes only. Calls that do not honor proxy env vars can bypass filtering
unless OS/container-level enforcement is added.
