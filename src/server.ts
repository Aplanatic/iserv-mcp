import {
  AuthBroker,
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
import { failure, success } from "./format.js";

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

async function withClient(action: (client: IServClient) => Promise<unknown>) {
  try {
    return success(await action(await new AuthBroker().restore()));
  } catch (error) {
    return failure(error);
  }
}

export function createIServMcpServer(): McpServer {
  const server = new McpServer({ name: "aplanatic-iserv", version: "0.1.0" });

  server.registerResource(
    "routes",
    "iserv://routes",
    {
      title: "IServ route catalog",
      description: "Sanitized normal-user route definitions",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(routeCatalog.routes),
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
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(routeCatalog.tree()),
        },
      ],
    }),
  );
  server.registerResource(
    "auth-status",
    new ResourceTemplate("iserv://auth/status{?profile}", { list: undefined }),
    {
      title: "IServ authentication status",
      description: "Local profile state without credentials",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const profile =
        typeof variables.profile === "string" ? variables.profile : undefined;
      const value = await new AuthBroker().status(profile);
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
        return success(await new AuthBroker().status(profile));
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
        return success({ profile: metadata.name, authenticated: true });
      } catch (error) {
        return failure(error);
      }
    },
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
      withClient((client) => client.messenger.sendMessage(roomId, body)),
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
      withClient((client) => client.messenger.deleteMessage(roomId, eventId)),
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
      withClient(async (client) => {
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
