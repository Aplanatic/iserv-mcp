import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createIServMcpServer } from "./server.js";

const server = createIServMcpServer();
await server.connect(new StdioServerTransport());
