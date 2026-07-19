# Aplanatic IServ MCP

Private, local stdio MCP server for normal-user IServ access. It shares the
native-keychain profile created by `@aplanatic/iserv-cli` and never returns
passwords, cookies, or tokens to agents.

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

Run `iserv auth login --url iserv.example` before starting the server. The real
instance hostname and all credentials must remain in local configuration and
the operating system credential store.

This software is not affiliated with or endorsed by IServ GmbH.
