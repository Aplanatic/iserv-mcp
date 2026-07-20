import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "iserv-live-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/main.mjs"],
  stderr: "pipe",
});

function parseText(result) {
  const block = result.content?.find((item) => item.type === "text");
  return JSON.parse(block?.text ?? "{}");
}

try {
  await client.connect(transport);
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  const authStartedAt = performance.now();
  const authResult = await client.callTool({ name: "iserv_auth_status", arguments: {} });
  const firstAuthMs = Math.round(performance.now() - authStartedAt);
  const cachedAuthStartedAt = performance.now();
  const cachedAuthResult = await client.callTool({
    name: "iserv_auth_status",
    arguments: {},
  });
  const cachedAuthMs = Math.round(performance.now() - cachedAuthStartedAt);
  const routeSearchResult = await client.callTool({
    name: "iserv_search_routes",
    arguments: { query: "calendar events", limit: 3 },
  });
  const batchResult = await client.callTool({
    name: "iserv_read_many",
    arguments: {
      requests: [
        { routeId: "etherpad.list" },
        { routeId: "groupview.overview" },
      ],
    },
  });
  const etherpadResult = await client.callTool({ name: "iserv_etherpad_list", arguments: {} });
  const roomsResult = await client.callTool({
    name: "iserv_messenger_list_rooms",
    arguments: {},
  });
  const auth = parseText(authResult);
  const routeMatches = parseText(routeSearchResult);
  const batch = parseText(batchResult);
  const etherpad = parseText(etherpadResult);
  const rooms = parseText(roomsResult);
  const checks = {
    boundedMessengerTools: [
      "iserv_messenger_list_rooms",
      "iserv_messenger_list_messages",
      "iserv_messenger_list_members",
      "iserv_messenger_get_profile",
    ].every((name) => names.includes(name)),
    authenticated: authResult.isError !== true && auth.authenticated === true,
    accountNamed: Boolean(auth.account?.displayName && auth.account?.username),
    capabilitiesVerified:
      auth.capabilitiesVerified === true && auth.capabilities?.length > 0,
    cachedAuthFaster:
      cachedAuthResult.isError !== true &&
      cachedAuthMs <= Math.max(50, firstAuthMs / 2),
    routeSearch:
      routeSearchResult.isError !== true &&
      Array.isArray(routeMatches) &&
      routeMatches[0]?.id === "calendar.events",
    concurrentBatch:
      batchResult.isError !== true &&
      Array.isArray(batch) &&
      batch.length === 2 &&
      batch.every((result) => result.status === 200),
    etherpadRead:
      etherpadResult.isError !== true &&
      etherpad.routeId === "etherpad.list" &&
      etherpad.status === 200,
    messengerRead:
      roomsResult.isError !== true && (!Array.isArray(rooms) || rooms.length <= 100),
  };
  console.log(JSON.stringify({ checks, performance: { firstAuthMs, cachedAuthMs } }));
  if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
} catch {
  console.error("Live stdio smoke test failed without exposing response data.");
  process.exitCode = 1;
} finally {
  await client.close();
}
