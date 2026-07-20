# Aplanatic IServ MCP

Private, local stdio MCP server for normal-user IServ access. It shares the
native-keychain profile created by `@aplanatic/iserv-cli` and never returns
passwords, cookies, or tokens to agents.

Authenticate npm for the private Aplanatic GitHub Packages registry, then run
`npm install --global @aplanatic/iserv-mcp`.

```json
{
  "mcpServers": {
    "iserv": { "command": "iserv-mcp" }
  }
}
```

Read tools are generated from the canonical API route catalog. Supported write
and destructive tools execute immediately and carry accurate MCP annotations.
There is no arbitrary HTTP, shell, or filesystem tool.

Verified module tools cover exercises, timetable, polls, forums, news, course
selection, mailing lists, and printing. Authenticated HTML is reduced to structural
counts before entering the MCP response. Experimental routes are visible in the
catalog resource but are never registered as callable tools.

Authentication status resources include the verified display name and an installed-module
capability matrix. Messenger room, message, member, and profile reads renew an older
keychain profile's scoped Matrix session automatically. They never send read receipts;
results remain bounded and redacted.

For a local authenticated, read-only production-path check, run
`npm run test:live`. It starts the built stdio binary and reports only pass/fail
booleans; it does not print account names, room names, messages, hostnames, or
response bodies.

Run `iserv auth login --url iserv.example` before starting the server. The real
instance hostname and all credentials must remain in local configuration and
the operating system credential store.

This software is not affiliated with or endorsed by IServ GmbH.
