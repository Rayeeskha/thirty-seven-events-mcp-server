import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { RequestHandler, Router } from "express";
import { env } from "../config/env";
import { LOG_MESSAGES, MCP_MESSAGES } from "../config/messages";
import { Services } from "../container";
import { logger } from "../utils/logger";
import { createMcpServer } from "./mcp-server";

const LOCALHOST_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const JSON_RPC_METHOD_NOT_ALLOWED = {
  jsonrpc: "2.0",
  error: { code: -32000, message: MCP_MESSAGES.methodNotAllowed },
  id: null,
};

const methodNotAllowed: RequestHandler = (_req, res) => {
  res.status(405).set("Allow", "POST").json(JSON_RPC_METHOD_NOT_ALLOWED);
};

/**
 * Stateless Streamable HTTP endpoint: each request gets its own server and transport,
 * and all durable state (including pending confirmations) lives in MySQL.
 */
export function createMcpRouter(services: Services): Router {
  const router = Router();
  const allowedHosts =
    env.MCP_ALLOWED_HOSTS.length > 0 ? env.MCP_ALLOWED_HOSTS : LOCALHOST_HOSTS;
  router.use(hostHeaderValidation(allowedHosts));

  router.post("/", async (req, res) => {
    const server = createMcpServer(services);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error(LOG_MESSAGES.mcpRequestFailed, error);
      if (!res.headersSent) {
        res
          .status(500)
          .json({
            jsonrpc: "2.0",
            error: { code: -32603, message: MCP_MESSAGES.internalServerError },
            id: null,
          });
      }
    }
  });

  router.get("/", methodNotAllowed);
  router.delete("/", methodNotAllowed);
  return router;
}
