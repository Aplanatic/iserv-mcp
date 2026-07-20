# Security policy

## Supported versions

Security fixes are applied to the latest release and `main`.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/Aplanatic/iserv-mcp/security/advisories/new).
Do not open a public issue for suspected vulnerabilities.

Never include a real instance hostname, username, email address, school name, screenshot,
HAR file, cookie, session, token, password, message, file, or unredacted MCP response. Use
`iserv.example`, synthetic identities, and mocked payloads in reproductions.

## Security boundaries

- The server is local stdio only and exposes no network listener, shell, arbitrary HTTP,
  unrestricted filesystem, raw credential, cookie, or token tool.
- Agents can use only profiles previously created by the human-facing CLI.
- All inputs are schema-bounded; read batches and outputs have strict size limits.
- Generated tools inherit the canonical route side-effect classification and MCP hints.
- Send, write, and destructive tools are intentionally explicit. Clients should use their
  annotations to warn users before execution.
- Tool errors and results pass through redaction, but authenticated content remains private
  account data and must not be copied into public reports.

Test only accounts and instances you own or are explicitly authorized to use. Do not send,
modify, upload, join, leave, or delete data while researching a read-path issue without
explicit approval.
