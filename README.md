# Aplanatic IServ MCP

Local stdio MCP server for normal-user IServ access. It shares the native-keychain profile
created by `@aplanatic/iserv-cli` and never returns passwords, cookies, or tokens to agents.

Current package version: **0.5.16** (pins `@aplanatic/iserv-api`).

Configure npm authentication for the Aplanatic GitHub Packages registry, then run
`npm install --global @aplanatic/iserv-mcp`.

```json
{
  "mcpServers": {
    "iserv": { "command": "iserv-mcp" }
  }
}
```

Read tools are generated from the canonical API route catalog. Supported write
and destructive tools execute immediately and carry accurate MCP annotations
(`readOnlyHint` / `destructiveHint`). There is no arbitrary HTTP, shell, or filesystem tool.

Verified module tools cover exercises, timetable, polls, forums, news, course
selection, mailing lists, and printing. Prefer structured loaders when available;
otherwise authenticated HTML is reduced to `HtmlExtractedData` before entering the MCP
response. Experimental routes are visible in the catalog resource but are never registered
as callable tools.

Authentication status resources include the verified display name and an installed-module
capability matrix. Messenger room, message, member, contact, and profile reads renew an
older keychain profile's scoped Matrix session automatically. They never send read receipts;
results remain bounded and redacted via `presentForDisplay` where applicable.

## Agent-first discovery and speed

Start with the compact tools instead of scanning or guessing the full generated tool set:

| Tool | Role |
|---|---|
| `iserv_auth_status` | Verified account name and module capability matrix |
| `iserv_auth_start_browser` | Start system-browser login for a profile |
| `iserv_search_routes` | Rank/filter catalog operations (no login required) |
| `iserv_search_users` | Bounded autocomplete user search |
| `iserv_read_many` | Up to eight supported session GET routes concurrently |
| `iserv_timetable_week` | Structured week grid |
| `iserv_timetable_today` | Structured today view |
| `iserv_messenger_list_rooms` | Bounded room list (no receipts) |
| `iserv_messenger_list_contacts` | DM contacts with display names |
| `iserv_messenger_list_messages` | Bounded message history |
| `iserv_messenger_list_members` | Room members |
| `iserv_messenger_get_profile` | Matrix profile |

Explicit write / destructive tools (annotations warn clients):

- `iserv_notifications_read_all`
- `iserv_mail_send`
- `iserv_messenger_send_message`
- `iserv_messenger_delete_message`
- `iserv_messenger_leave_room`
- `iserv_calendar_delete_event`

Additional read tools are generated from supported catalog routes (for example news,
exercises, polls, forums, holidays). Use `iserv_search_routes` to discover them.

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

Run `iserv auth login --url iserv.example` (or restore an existing keychain profile)
before starting the server. Ephemeral CLI logins are not restored by MCP. The real
instance hostname and all credentials must remain in local configuration and
the operating system credential store.

## Security and contributing

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability and use GitHub private
vulnerability reporting. Never put a real hostname, identity, screenshot, HAR file,
credential, cookie, token, message, file content, or live MCP response in an issue or pull
request. See [CONTRIBUTING.md](CONTRIBUTING.md) for tool-boundary and sanitization rules.

This software is not affiliated with or endorsed by IServ GmbH.
