/** MCP-specific behaviour, exercised with the official SDK client over Streamable HTTP. */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "node:http";
import {
  MCP_SERVER_CONFIG,
  MCP_TOOLS_CONFIG,
} from "../../src/config/mcp-tools.config";
import { EventService } from "../../src/modules/events/event.service";
import {
  countEvents,
  countEventsNamed,
  findEventRow,
  resetDatabase,
} from "../helpers/database";
import {
  confirmCreate,
  confirmStatus,
  NEW_EVENT,
  proposeCreate,
  proposeStatus,
} from "../helpers/flows";
import { Harness, startHarness } from "../helpers/harness";

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "raw-http", version: "1" },
  },
};

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function rawRequest(
  baseUrl: string,
  options: {
    method: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<RawResponse> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: options.path ?? "/mcp",
        method: options.method,
        headers: options.headers,
        agent: false,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

const JSON_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

describe("MCP server", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });
  afterAll(async () => {
    await harness.close();
  });
  beforeEach(async () => {
    harness.clock.reset();
    await resetDatabase();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("server description", () => {
    it("identifies itself and tells the model confirmation is mandatory", () => {
      const { client } = harness.mcp;
      expect(client.getServerVersion()).toMatchObject({
        name: MCP_SERVER_CONFIG.name,
        version: MCP_SERVER_CONFIG.version,
      });
      expect(client.getInstructions()).toBe(MCP_SERVER_CONFIG.instructions);
      expect(client.getInstructions()).toMatch(/explicit confirmation/i);
      expect(client.getInstructions()).toMatch(/Never assume confirmation/);
    });

    it("advertises the tools capability", () => {
      expect(harness.mcp.client.getServerCapabilities()?.tools).toBeDefined();
    });
  });

  describe("tool catalogue", () => {
    it("exposes exactly the five required tools", async () => {
      const { tools } = await harness.mcp.client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        Object.values(MCP_TOOLS_CONFIG)
          .map((tool) => tool.name)
          .sort(),
      );
      for (const tool of tools) {
        expect(tool.description?.length).toBeGreaterThan(40);
        expect(tool.inputSchema.type).toBe("object");
        const configured = Object.values(MCP_TOOLS_CONFIG).find(
          (config) => config.name === tool.name,
        )!;
        expect(tool.title).toBe(configured.title);
        expect(tool.description).toBe(configured.description);
        expect(tool.annotations).toMatchObject(configured.annotations);
        expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(
          Object.keys(configured.inputSchema).sort(),
        );
      }
    });

    it("describes add_event: required fields, optional fields, and the confirmation token", async () => {
      const { tools } = await harness.mcp.client.listTools();
      const { inputSchema } = tools.find((tool) => tool.name === "add_event")!;
      expect(Object.keys(inputSchema.properties ?? {}).sort()).toEqual([
        "budget",
        "client",
        "confirmation_token",
        "event_date",
        "event_name",
        "number_of_projects",
        "status",
      ]);
      expect([...(inputSchema.required ?? [])].sort()).toEqual([
        "budget",
        "client",
        "event_date",
        "event_name",
      ]);
      expect(inputSchema.properties?.event_date).toMatchObject({
        type: "string",
        format: "date",
      });
      expect(inputSchema.properties?.status).toMatchObject({
        enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      });
    });

    it("describes update_event_status: event_id and status required", async () => {
      const { tools } = await harness.mcp.client.listTools();
      const { inputSchema } = tools.find(
        (tool) => tool.name === "update_event_status",
      )!;
      expect([...(inputSchema.required ?? [])].sort()).toEqual([
        "event_id",
        "status",
      ]);
      expect(inputSchema.properties).toHaveProperty("confirmation_token");
    });

    it("describes search_events with all-optional filters", async () => {
      const { tools } = await harness.mcp.client.listTools();
      const { inputSchema } = tools.find(
        (tool) => tool.name === "search_events",
      )!;
      expect(Object.keys(inputSchema.properties ?? {})).toEqual(
        expect.arrayContaining([
          "event_date",
          "date_from",
          "date_to",
          "client",
          "status",
        ]),
      );
      expect(inputSchema.required ?? []).toEqual([]);
    });

    it("requires channel for draft_marketing_message and offers EN, AR and BOTH", async () => {
      const { tools } = await harness.mcp.client.listTools();
      const { inputSchema } = tools.find(
        (tool) => tool.name === "draft_marketing_message",
      )!;
      expect([...(inputSchema.required ?? [])].sort()).toEqual([
        "channel",
        "event_id",
      ]);
      expect(inputSchema.properties?.language).toMatchObject({
        enum: ["EN", "AR", "BOTH"],
      });
      expect(inputSchema.properties?.channel).toMatchObject({
        enum: ["INSTAGRAM_POST", "EMAIL"],
      });
    });

    it("tells the model, in the write tools' descriptions, to obtain explicit confirmation first", async () => {
      const { tools } = await harness.mcp.client.listTools();
      for (const name of ["add_event", "update_event_status"]) {
        const { description } = tools.find((tool) => tool.name === name)!;
        expect(description).toMatch(/explicit(ly)? confirm/i);
        expect(description).toMatch(/WITHOUT confirmation_token/);
        expect(description).toMatch(/Never confirm on the user's behalf/);
      }
    });

    it("marks read-only tools as read-only and write tools as not", async () => {
      const { tools } = await harness.mcp.client.listTools();
      const readOnly = (name: string) =>
        tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint;
      for (const name of [
        "search_events",
        "get_event_details",
        "draft_marketing_message",
      ])
        expect(readOnly(name)).toBe(true);
      for (const name of ["add_event", "update_event_status"])
        expect(readOnly(name)).toBe(false);
    });
  });

  describe("tool results", () => {
    it("return JSON text content and no isError on success", async () => {
      const { isError, text } = await harness.mcp.callRaw("get_event_details", {
        event_id: 8,
      });
      expect(isError).toBe(false);
      expect(JSON.parse(text).id).toBe(8);
    });

    it("flag domain failures with isError and a machine-readable code", async () => {
      const { isError, text } = await harness.mcp.callRaw("get_event_details", {
        event_id: 99999,
      });
      expect(isError).toBe(true);
      expect(JSON.parse(text)).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Event with id 99999 was not found",
        },
      });
    });

    it("flag input that violates a tool's schema, without running the tool", async () => {
      const { isError, text } = await harness.mcp.callRaw("add_event", {
        ...NEW_EVENT,
        budget: -5,
      });
      expect(isError).toBe(true);
      expect(text).toMatch(/validation/i);
      expect(await countEvents()).toBe(14);
    });

    it("flag missing required arguments", async () => {
      const { isError } = await harness.mcp.callRaw("update_event_status", {
        status: "COMPLETED",
      });
      expect(isError).toBe(true);
    });

    it("reject an unknown tool", async () => {
      const outcome = await harness.mcp
        .callRaw("delete_event", { event_id: 1 })
        .then(
          (result) => ({ failed: result.isError }),
          () => ({ failed: true }),
        );
      expect(outcome.failed).toBe(true);
      expect(await countEvents()).toBe(14);
    });

    it("cannot be used to write by calling a read-only tool with a token", async () => {
      const { confirmation_token } = await proposeCreate(harness.mcp);
      await harness.mcp.callRaw("search_events", { confirmation_token });
      expect(await countEventsNamed("Saudi Tech Expo")).toBe(0);
    });
  });

  describe("stateless transport: state lives in MySQL, not in a session", () => {
    it("lets a different MCP client confirm a proposal made by another", async () => {
      const clientA = await harness.connectMcp();
      const clientB = await harness.connectMcp();
      const { confirmation_token } = await proposeCreate(clientA);
      const { event } = await confirmCreate(clientB, confirmation_token);
      expect(event.event_name).toBe("Saudi Tech Expo");
    });

    it("lets a status proposal made by one client be confirmed by another", async () => {
      const clientA = await harness.connectMcp();
      const clientB = await harness.connectMcp();
      const { confirmation_token } = await proposeStatus(
        clientA,
        8,
        "COMPLETED",
      );
      await confirmStatus(clientB, 8, "COMPLETED", confirmation_token);
      expect((await findEventRow(8))?.status).toBe("COMPLETED");
    });
  });

  describe("input safety (MCP equivalents of the former REST checks)", () => {
    const call = async (name: string, args: object) => {
      const { isError, text } = await harness.mcp.callRaw(
        name,
        args as Record<string, unknown>,
      );
      return { isError, body: JSON.parse(text) as Record<string, any> };
    };

    it("ignores arguments it does not own, so none are stored (no mass assignment)", async () => {
      const injected = {
        ...NEW_EVENT,
        id: 999,
        created_at: "1999-01-01T00:00:00Z",
        updated_at: "1999-01-01T00:00:00Z",
        is_admin: true,
      };
      const proposal = await call("add_event", injected);
      expect(proposal.body.proposed).toEqual({
        ...NEW_EVENT,
        status: "PLANNED",
      });

      const created = await call("add_event", {
        ...injected,
        confirmation_token: proposal.body.confirmation_token,
      });
      expect(created.body.outcome).toBe("EXECUTED");
      expect(created.body.event.id).not.toBe(999);
      expect(created.body.event.created_at).not.toContain("1999");
      expect(await findEventRow(999)).toBeNull();
    });

    it("stores text containing SQL metacharacters verbatim without executing it", async () => {
      const hostile = {
        ...NEW_EVENT,
        event_name: "Robert'); DROP TABLE events;--",
        client: '" OR 1=1 --',
      };
      const proposal = await call("add_event", hostile);
      const created = await call("add_event", {
        ...hostile,
        confirmation_token: proposal.body.confirmation_token,
      });
      expect(created.body.event.event_name).toBe(
        "Robert'); DROP TABLE events;--",
      );
      expect(await countEvents()).toBe(15);
      expect(
        (await call("search_events", { client: '" OR 1=1 --' })).body.pagination
          .total,
      ).toBe(1);
    });

    it("never puts a stack trace or internal detail in an error result", async () => {
      const { text } = await harness.mcp.callRaw("get_event_details", {
        event_id: 99999,
      });
      expect(text).not.toMatch(/stack|node_modules|\.ts:|ZodError/i);
    });
  });

  describe("Streamable HTTP endpoint", () => {
    it("answers a raw initialize request from a non-SDK client", async () => {
      const res = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(INITIALIZE),
      });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      const { result } = JSON.parse(res.body);
      expect(result.serverInfo.name).toBe("thirty-seven-events");
      expect(result.capabilities.tools).toBeDefined();
      expect(res.headers["mcp-session-id"]).toBeUndefined(); // stateless: no session to track
    });

    it.each(["GET", "DELETE"])(
      "answers %s with 405, because the server is stateless",
      async (method) => {
        const res = await rawRequest(harness.baseUrl, {
          method,
          headers: { accept: "text/event-stream" },
        });
        expect(res.status).toBe(405);
        expect(res.headers.allow).toBe("POST");
        expect(JSON.parse(res.body).error.code).toBe(-32000);
      },
    );

    it("rejects a body that is not a JSON-RPC message", async () => {
      const res = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ hello: "world" }),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe(-32700);
    });

    it("rejects a request that cannot accept the response types", async () => {
      const res = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/html" },
        body: JSON.stringify(INITIALIZE),
      });
      expect(res.status).toBe(406);
    });

    it("rejects a foreign Host header to defend against DNS rebinding", async () => {
      const res = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: { ...JSON_HEADERS, host: "evil.example.com" },
        body: JSON.stringify(INITIALIZE),
      });
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body).error.message).toMatch(/Invalid Host/);
    });

    it("accepts the localhost Host headers a local client would send", async () => {
      for (const host of ["localhost", "localhost:3001", "127.0.0.1"]) {
        const res = await rawRequest(harness.baseUrl, {
          method: "POST",
          headers: { ...JSON_HEADERS, host },
          body: JSON.stringify(INITIALIZE),
        });
        expect(res.status).toBe(200);
      }
    });

    it("answers 500 with a generic JSON-RPC error if the transport itself fails, then keeps serving", async () => {
      jest
        .spyOn(StreamableHTTPServerTransport.prototype, "handleRequest")
        .mockRejectedValueOnce(new Error("transport exploded: secret=hunter2"));
      const failed = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(INITIALIZE),
      });
      expect(failed.status).toBe(500);
      expect(JSON.parse(failed.body)).toEqual({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
      expect(failed.body).not.toContain("hunter2");

      const next = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(INITIALIZE),
      });
      expect(next.status).toBe(200);
    });

    it("rejects malformed JSON with a 400 and a clear message", async () => {
      const res = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: JSON_HEADERS,
        body: '{"jsonrpc": ',
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error).toEqual({
        code: "VALIDATION_ERROR",
        message: "Request body must be valid JSON",
      });
    });

    it("rejects an oversized body with a 413", async () => {
      const res = await rawRequest(harness.baseUrl, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ padding: "x".repeat(200_000) }),
      });
      expect(res.status).toBe(413);
      expect(JSON.parse(res.body).error.code).toBe("PAYLOAD_TOO_LARGE");
    });

    it("serves only the configured path", async () => {
      const res = await rawRequest(harness.baseUrl, {
        method: "POST",
        path: "/other",
        headers: JSON_HEADERS,
        body: JSON.stringify(INITIALIZE),
      });
      expect(res.status).toBe(404);
    });
  });
});

describe("MCP server when something unexpected fails", () => {
  let harness: Harness;

  beforeAll(async () => {
    const failing = {
      searchEvents: async () => {
        throw new Error(
          "connection to db.internal.example failed: password=hunter2",
        );
      },
    } as unknown as EventService;
    harness = await startHarness({ eventService: failing });
  });
  afterAll(async () => {
    await harness.close();
  });

  it("returns a generic INTERNAL_ERROR tool result that does not leak the cause", async () => {
    const { isError, text } = await harness.mcp.callRaw("search_events", {});
    expect(isError).toBe(true);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
    expect(text).not.toMatch(/hunter2|internal\.example/);
  });

  it("keeps serving other tools after one tool has failed", async () => {
    await resetDatabase();
    expect((await harness.mcp.callRaw("search_events", {})).isError).toBe(true);

    const { isError, text } = await harness.mcp.callRaw(
      "draft_marketing_message",
      { event_id: 10, channel: "EMAIL", language: "EN" },
    );
    expect(isError).toBe(false);
    expect(JSON.parse(text).event_name).toBe("Riyadh Season Pop-Up Showcase");
  });
});
