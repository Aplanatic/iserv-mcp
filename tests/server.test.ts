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
    expect(tools.some((tool) => tool.name === "iserv_exercise_list")).toBe(
      true,
    );
    expect(tools.some((tool) => tool.name === "iserv_news_list")).toBe(true);
    expect(tools.some((tool) => tool.name === "iserv_etherpad_list")).toBe(
      true,
    );
    expect(
      tools.some((tool) => tool.name === "iserv_messenger_list_rooms"),
    ).toBe(true);
    expect(
      tools.some((tool) => tool.name === "iserv_messenger_list_members"),
    ).toBe(true);
    expect(tools.some((tool) => tool.name === "iserv_search_routes")).toBe(
      true,
    );
    expect(tools.some((tool) => tool.name === "iserv_search_users")).toBe(true);
    expect(tools.some((tool) => tool.name === "iserv_read_many")).toBe(true);
    expect(tools.some((tool) => tool.name === "iserv_pinboard_list")).toBe(
      false,
    );
    expect(
      tools.every(
        (tool) => !tool.name.includes("http") && !tool.name.includes("shell"),
      ),
    ).toBe(true);
    expect(resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining([
        "iserv://routes",
        "iserv://modules",
        "iserv://auth/status",
      ]),
    );
    expect(resourceTemplates.map((resource) => resource.uriTemplate)).toContain(
      "iserv://auth/status{?profile}",
    );
  });

  test("returns compact ranked route search results without authentication", async () => {
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
      name: "iserv_search_routes",
      arguments: { query: "calendar events", limit: 3 },
    });
    const content = (
      result as { content?: Array<{ type: string; text?: string }> }
    ).content;
    const block = content?.find((item) => item.type === "text");
    const matches = JSON.parse(block?.text ?? "[]") as Array<{ id?: string }>;

    expect(result.isError).not.toBe(true);
    expect(matches[0]?.id).toBe("calendar.events");
    expect(matches).toHaveLength(3);
  });

  test("returns structured tool errors without exposing secrets", async () => {
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
      name: "iserv_users_show",
      arguments: {},
    });
    const text = JSON.stringify(result);

    expect(result.isError).toBe(true);
    expect(text).not.toMatch(/cookie|password|token/i);
  });
});
