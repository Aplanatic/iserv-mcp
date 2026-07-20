# Contributing

Contributions must preserve bounded tools, accurate annotations, and privacy.

- Use only `iserv.example`, `example.invalid`, and synthetic account data.
- Never add live hostnames, identities, screenshots, HAR files, credentials, cookies,
  tokens, response dumps, messages, email, or file contents.
- Do not add shell execution, arbitrary HTTP, raw secrets, unrestricted filesystem access,
  admin probing, or permission-bypass behavior.
- Every tool needs a bounded schema, bounded/redacted output, and correct `readOnlyHint` and
  `destructiveHint` annotations.
- Route tools must come from the canonical API catalog rather than duplicated URL strings.
- Prefer structured loaders / `presentForDisplay` over raw HTML dumps.
- Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue.

Run before submitting:

```sh
npm ci
npm run check
npm audit --audit-level=low
gitleaks git --redact=100 --log-opts=--all .
```

Live tests are local-only, read-only, and must run through the production stdio transport
without printing live data or identifiers. Update [README.md](README.md) and
[CHANGELOG.md](CHANGELOG.md) when tools or behavior change.
