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

## Agent-first discovery and speed

Start with the compact tools instead of scanning or guessing the full generated tool set:

- `iserv_auth_status` returns the verified account name and module capability matrix.
- `iserv_search_routes` ranks and filters catalog operations without requiring login.
- `iserv_search_users` uses the bounded fast autocomplete endpoint.
- `iserv_read_many` runs up to eight supported session GET routes concurrently.
- `iserv_messenger_list_rooms`, `iserv_messenger_list_messages`,
  `iserv_messenger_list_members`, and `iserv_messenger_get_profile` provide bounded Matrix
  reads without sending receipts.

The stdio process keeps a successfully restored client for 30 seconds and auth status for
15 seconds. This avoids repeated keychain/native-module and cookie setup during an agent
turn while still refreshing quickly; any request failure or completed browser login clears
the cache immediately. Batch reads reuse the same client and default to four concurrent
requests. All tool output is globally bounded and redacted.

The resources `iserv://routes`, `iserv://modules`, and `iserv://auth/status` provide the
same canonical discovery context without an HTTP or shell escape hatch. Experimental
routes remain documentation-only and are not generated as callable tools.

For a local authenticated, read-only production-path check, run
`npm run test:live`. It starts the built stdio binary and reports only pass/fail
booleans; it does not print account names, room names, messages, hostnames, or
response bodies. The check covers cached auth, ranked route search, concurrent batch reads,
Etherpad, and Messenger over the real production stdio path.

Run `iserv auth login --url iserv.example` before starting the server. The real
instance hostname and all credentials must remain in local configuration and
the operating system credential store.

This software is not affiliated with or endorsed by IServ GmbH.
