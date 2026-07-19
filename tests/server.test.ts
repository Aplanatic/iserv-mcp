import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, test } from "vitest";
import { createIServMcpServer } from "../src/server.js";

describe("IServ MCP server", () => {
  const connections: Array<{
    client: Client;
    server: ReturnType<typeof createIServMcpServer>;
  }> = [];

  afterEach(async () => {
    await Promise.all(
      connections.splice(0).map(async ({ client, server }) => {
        await client.close();
        await server.close();
      }),
    );
  });

  test("advertises bounded catalog tools and resources", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createIServMcpServer();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    connections.push({ client, server });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const [{ tools }, { resources }, { resourceTemplates }] = await Promise.all(
      [
        client.listTools(),
        client.listResources(),
        client.listResourceTemplates(),
      ],
    );

    expect(tools.some((tool) => tool.name === "iserv_auth_status")).toBe(true);
    expect(
      tools.some((tool) => tool.name === "iserv_messenger_send_message"),
    ).toBe(true);
    expect(
      tools.every(
        (tool) => !tool.name.includes("http") && !tool.name.includes("shell"),
      ),
    ).toBe(true);
    expect(resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining(["iserv://routes", "iserv://modules"]),
    );
    expect(resourceTemplates.map((resource) => resource.uriTemplate)).toContain(
      "iserv://auth/status{?profile}",
    );
  });

  test("returns structured auth errors without exposing secrets", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createIServMcpServer();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    connections.push({ client, server });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const result = await client.callTool({
      name: "iserv_account_get",
      arguments: {},
    });
    const text = JSON.stringify(result);

    expect(result.isError).toBe(true);
    expect(text).not.toMatch(/cookie|password|token/i);
  });
});
