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
  const authResult = await client.callTool({ name: "iserv_auth_status", arguments: {} });
  const etherpadResult = await client.callTool({ name: "iserv_etherpad_list", arguments: {} });
  const roomsResult = await client.callTool({
    name: "iserv_messenger_list_rooms",
    arguments: {},
  });
  const auth = parseText(authResult);
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
    etherpadRead:
      etherpadResult.isError !== true &&
      etherpad.routeId === "etherpad.list" &&
      etherpad.status === 200,
    messengerRead:
      roomsResult.isError !== true && (!Array.isArray(rooms) || rooms.length <= 100),
  };
  console.log(JSON.stringify(checks));
  if (Object.values(checks).some((value) => !value)) process.exitCode = 1;
} catch {
  console.error("Live stdio smoke test failed without exposing response data.");
  process.exitCode = 1;
} finally {
  await client.close();
}
