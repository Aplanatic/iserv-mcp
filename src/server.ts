import {
  AuthBroker,
  type AuthStatus,
  type IServClient,
  ProfileStore,
  routeCatalog,
} from "@aplanatic/iserv-api";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readableRoutes, toolNameForRoute } from "./catalog.js";
import { failure, formatForAgent, success } from "./format.js";

const annotations = {
  read: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  write: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  destructive: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

const CLIENT_TTL_MS = 30_000;
const STATUS_TTL_MS = 15_000;

class SessionPool {
  private client:
    | { value: Promise<IServClient>; expiresAt: number }
    | undefined;
  private messenger:
    | { value: Promise<IServClient>; expiresAt: number }
    | undefined;
  private readonly statuses = new Map<
    string,
    { value: Promise<AuthStatus>; expiresAt: number }
  >();

  constructor(private readonly broker = new AuthBroker()) {}

  restore(messenger = false): Promise<IServClient> {
    const current = messenger ? this.messenger : this.client;
    if (current && current.expiresAt > Date.now()) return current.value;
    const value = messenger
      ? this.broker.restoreMessenger()
      : this.broker.restore();
    const entry = { value, expiresAt: Date.now() + CLIENT_TTL_MS };
    if (messenger) {
      this.messenger = entry;
      this.client = entry;
    } else {
      this.client = entry;
    }
    value.catch(() => this.invalidate());
    return value;
  }

  status(profile?: string): Promise<AuthStatus> {
    const key = profile ?? "";
    const current = this.statuses.get(key);
    if (current && current.expiresAt > Date.now()) return current.value;
    const value = this.broker.status(profile);
    this.statuses.set(key, {
      value,
      expiresAt: Date.now() + STATUS_TTL_MS,
    });
    value.catch(() => this.statuses.delete(key));
    return value;
  }

  invalidate(): void {
    this.client = undefined;
    this.messenger = undefined;
    this.statuses.clear();
  }
}

export function createIServMcpServer(): McpServer {
  const server = new McpServer({ name: "aplanatic-iserv", version: "0.4.1" });
  const sessions = new SessionPool();
  const withClient = async (
    action: (client: IServClient) => Promise<unknown>,
  ) => {
    try {
      return success(await action(await sessions.restore()));
    } catch (error) {
      sessions.invalidate();
      return failure(error);
    }
  };
  const withMessengerClient = async (
    action: (client: IServClient) => Promise<unknown>,
  ) => {
    try {
      return success(await action(await sessions.restore(true)));
    } catch (error) {
      sessions.invalidate();
      return failure(error);
    }
  };

  server.registerResource(
    "routes",
    "iserv://routes",
    {
      title: "IServ route catalog",
      description: "Sanitized normal-user route definitions with counts",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            count: routeCatalog.routes.length,
            modules: routeCatalog.modules().length,
            routes: routeCatalog.routes,
          }),
        },
      ],
    }),
  );
  server.registerResource(
    "modules",
    "iserv://modules",
    {
      title: "IServ modules",
      description: "Modules represented in the route catalog",
      mimeType: "application/json",
    },
    async (uri) => {
      const tree = routeCatalog.tree();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              count: Object.keys(tree).length,
              totalRoutes: Object.values(tree).reduce(
                (sum, routes) => sum + routes.length,
                0,
              ),
              modules: Object.fromEntries(
                Object.entries(tree).map(([module, routes]) => [
                  module,
                  {
                    routeCount: routes.length,
                    methods: [...new Set(routes.map((r) => r.method))],
                    routes: routes.map((r) => ({
                      id: r.id,
                      method: r.method,
                      summary: r.summary,
                    })),
                  },
                ]),
              ),
            }),
          },
        ],
      };
    },
  );
  server.registerResource(
    "auth-status",
    "iserv://auth/status",
    {
      title: "IServ authentication status",
      description: "Active local profile state without credentials",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await sessions.status()),
        },
      ],
    }),
  );
  server.registerResource(
    "auth-status-profile",
    new ResourceTemplate("iserv://auth/status{?profile}", { list: undefined }),
    {
      title: "IServ authentication status",
      description: "Local profile state without credentials",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const profile =
        typeof variables.profile === "string" ? variables.profile : undefined;
      const value = await sessions.status(profile);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(value),
          },
        ],
      };
    },
  );

  server.registerTool(
    "iserv_auth_status",
    {
      title: "IServ authentication status",
      description:
        "Check whether a local keychain profile is authenticated. Never returns credentials.",
      inputSchema: z.object({ profile: z.string().optional() }),
      annotations: annotations.read,
    },
    async ({ profile }) => {
      try {
        return success(await sessions.status(profile));
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.registerTool(
    "iserv_auth_start_browser",
    {
      title: "Start browser login",
      description:
        "Open browser login for an existing CLI-created profile. The user completes all credential and 2FA entry in the browser.",
      inputSchema: z.object({ profile: z.string().optional() }),
      annotations: annotations.write,
    },
    async ({ profile }) => {
      try {
        const store = new ProfileStore();
        const document = await store.read();
        const name = profile ?? document.activeProfile;
        const metadata = document.profiles.find((item) => item.name === name);
        if (!metadata)
          throw new Error("Profile must first be created with the iserv CLI");
        await new AuthBroker(store).loginBrowser({
          profile: metadata.name,
          url: metadata.hostname,
          username: metadata.username,
        });
        sessions.invalidate();
        return success({ profile: metadata.name, authenticated: true });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "iserv_search_routes",
    {
      title: "Search IServ capabilities",
      description:
        "Quickly find the best matching catalogued operations before choosing a more specific tool.",
      inputSchema: z.object({
        query: z.string().default(""),
        module: z.string().optional(),
        method: z
          .enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "PROPFIND"])
          .optional(),
        sideEffect: z
          .enum(["read", "write", "communicative", "destructive"])
          .optional(),
        status: z
          .enum(["supported", "experimental", "documented-only", "deprecated"])
          .optional(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      annotations: annotations.read,
    },
    async ({ query, module, method, sideEffect, status, limit }) =>
      success(
        routeCatalog
          .search(query, {
            ...(module ? { module } : {}),
            ...(method ? { method } : {}),
            ...(sideEffect ? { sideEffect } : {}),
            ...(status ? { status } : {}),
            limit,
          })
          .map((route) => ({
            id: route.id,
            method: route.method,
            module: route.module,
            status: route.status,
            sideEffect: route.sideEffect,
            summary: route.summary,
            requiredParameters: route.parameters
              .filter((parameter) => parameter.required)
              .map((parameter) => parameter.name),
          })),
      ),
  );
  server.registerTool(
    "iserv_search_users",
    {
      title: "Search visible users",
      description:
        "Use the fast bounded autocomplete endpoint to find visible users or groups.",
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      annotations: annotations.read,
    },
    async ({ query, limit }) =>
      withClient((client) => client.users.searchAutocomplete(query, limit)),
  );
  server.registerTool(
    "iserv_read_many",
    {
      title: "Read multiple IServ routes",
      description:
        "Run up to eight supported session GET routes concurrently with one cached profile session.",
      inputSchema: z.object({
        requests: z
          .array(
            z.object({
              routeId: z.string().min(1),
              parameters: z
                .record(
                  z.string(),
                  z.union([z.string(), z.number(), z.boolean()]),
                )
                .optional(),
            }),
          )
          .min(1)
          .max(8),
        concurrency: z.number().int().min(1).max(8).default(4),
      }),
      annotations: annotations.read,
    },
    async ({ requests, concurrency }) =>
      withClient((client) =>
        client.executeReadRoutes(
          requests.map((request) =>
            request.parameters
              ? { routeId: request.routeId, parameters: request.parameters }
              : { routeId: request.routeId },
          ),
          { concurrency },
        ),
      ),
  );

  for (const route of readableRoutes) {
    server.registerTool(
      toolNameForRoute(route),
      {
        title: route.summary,
        description: `${route.description} Route: ${route.id}`,
        inputSchema: z.object({
          parameters: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
            .optional(),
        }),
        annotations: annotations.read,
      },
      async ({ parameters }) =>
        withClient((client) =>
          client.executeReadRoute(route.id, parameters ?? {}),
        ),
    );
  }

  server.registerTool(
    "iserv_messenger_list_rooms",
    {
      title: "List messenger rooms",
      description:
        "List joined rooms without sending messages or read receipts.",
      inputSchema: z.object({}),
      annotations: annotations.read,
    },
    async () => withMessengerClient((client) => client.messenger.getRooms()),
  );
  server.registerTool(
    "iserv_messenger_list_messages",
    {
      title: "List messenger messages",
      description:
        "Read a bounded page from a joined room without sending a read receipt.",
      inputSchema: z.object({
        roomId: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(20),
        from: z.string().optional(),
      }),
      annotations: annotations.read,
    },
    async ({ roomId, limit, from }) =>
      withMessengerClient((client) =>
        client.messenger.getMessages(roomId, {
          limit,
          ...(from ? { from } : {}),
        }),
      ),
  );
  server.registerTool(
    "iserv_messenger_list_members",
    {
      title: "List messenger room members",
      description: "List current members of a joined room.",
      inputSchema: z.object({ roomId: z.string().min(1) }),
      annotations: annotations.read,
    },
    async ({ roomId }) =>
      withMessengerClient((client) => client.messenger.getMembers(roomId)),
  );
  server.registerTool(
    "iserv_messenger_get_profile",
    {
      title: "Read a messenger profile",
      description: "Read a visible Matrix display name and avatar reference.",
      inputSchema: z.object({ userId: z.string().min(1) }),
      annotations: annotations.read,
    },
    async ({ userId }) =>
      withMessengerClient((client) => client.messenger.getProfile(userId)),
  );
  server.registerTool(
    "iserv_notifications_read_all",
    {
      title: "Mark all notifications read",
      description:
        "Immediately marks every currently visible notification as read.",
      inputSchema: z.object({}),
      annotations: annotations.write,
    },
    async () => withClient((client) => client.notifications.readAll()),
  );
  server.registerTool(
    "iserv_mail_send",
    {
      title: "Send email",
      description: "Immediately sends an email from the active IServ account.",
      inputSchema: z.object({
        to: z.string().min(1),
        subject: z.string(),
        body: z.string(),
      }),
      annotations: annotations.write,
    },
    async (input) =>
      withClient(async (client) => {
        await client.email.sendEmail(input);
        return { sent: true };
      }),
  );
  server.registerTool(
    "iserv_messenger_send_message",
    {
      title: "Send messenger message",
      description: "Immediately sends a message to a joined room.",
      inputSchema: z.object({
        roomId: z.string().min(1),
        body: z.string().min(1),
      }),
      annotations: annotations.write,
    },
    async ({ roomId, body }) =>
      withMessengerClient((client) =>
        client.messenger.sendMessage(roomId, body),
      ),
  );
  server.registerTool(
    "iserv_messenger_delete_message",
    {
      title: "Delete messenger message",
      description: "Immediately redacts a messenger event when permitted.",
      inputSchema: z.object({
        roomId: z.string().min(1),
        eventId: z.string().min(1),
      }),
      annotations: annotations.destructive,
    },
    async ({ roomId, eventId }) =>
      withMessengerClient((client) =>
        client.messenger.deleteMessage(roomId, eventId),
      ),
  );
  server.registerTool(
    "iserv_messenger_leave_room",
    {
      title: "Leave messenger room",
      description: "Immediately leaves a joined messenger room.",
      inputSchema: z.object({ roomId: z.string().min(1) }),
      annotations: annotations.destructive,
    },
    async ({ roomId }) =>
      withMessengerClient(async (client) => {
        await client.messenger.leaveRoom(roomId);
        return { left: true, roomId };
      }),
  );
  server.registerTool(
    "iserv_calendar_delete_event",
    {
      title: "Delete calendar event",
      description: "Immediately deletes a calendar event when permitted.",
      inputSchema: z.object({
        uid: z.string().min(1),
        hash: z.string().min(1),
        calendar: z.string().min(1),
        start: z.string().min(1),
        series: z.boolean().optional(),
      }),
      annotations: annotations.destructive,
    },
    async ({ uid, hash, calendar, start, series }) =>
      withClient((client) =>
        client.calendar.deleteEvent({
          uid,
          hash,
          calendar,
          start,
          ...(series === undefined ? {} : { series }),
        }),
      ),
  );

  return server;
}
