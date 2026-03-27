# Network Proxy — Production Review Notes

## Status

- [x] DNS rebinding mitigation — `resolveAndCheckIp()` checks all resolved IPs
      against RFC-1918 ranges before connecting
- [x] IP address blocking — raw IPs in CONNECT/HTTP requests are rejected by
      `isHostAllowed()` (`net.isIP()` check)
- [x] Request body size limit — 100 MiB default, configurable via
      `maxRequestBodyBytes`; returns 413
- [x] Connection limit — 100 default, configurable via `maxConnections`; returns
      503
- [x] Upstream socket timeout — 30 s default, configurable via
      `upstreamTimeoutMs`; destroys stalled sockets
- [x] Structured metrics counters — proxy tracks reason-coded outcomes
      (`allowed`, `blocked`, `dns_resolution_failed`, `private_ip_blocked`,
      `limit_exceeded`, `timeout`)
- [x] Proxy header sanitization coverage — regression tests confirm proxy-only
      headers are stripped before upstream forwarding
- [x] dispose() safety net — `process.once('exit', ...)` registered in
      constructor; deregistered on explicit dispose
- [x] IPv6 bracket notation in CONNECT — `[::1]:443` parsed correctly
- [x] Real subprocess integration coverage — validates `curl` and
      `python requests` are proxy-enforced and documents `node:http` env-proxy
      bypass behavior
- [x] Property-based parser/matcher coverage — randomized tests for wildcard
      hostname matching and CONNECT authority validation
- [x] Chaos coverage — alternating DNS failures/private IP resolutions and
      upstream failure churn paths are exercised
- [x] PR description updated with honest scope/limitations

## Remaining architectural gap (document, not fix)

`SandboxManager.prepareCommand()` controls child process environments only.
gemini-cli's own network calls (Gemini API, MCP connections) happen above this
layer and are not filtered by env-based proxying. Full enforcement requires
OS-level interception. This is documented in the code and PR body.
