// Runs in every test worker before any application module is imported.
process.env.NODE_ENV = "test";
process.env.DB_NAME = process.env.TEST_DB_NAME ?? "thirty_seven_events_test";
process.env.CONFIRMATION_TTL_SECONDS = "300";
process.env.MCP_PATH = "/mcp";
process.env.MCP_ALLOWED_HOSTS = "";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(
    `Refusing to run tests against "${process.env.DB_NAME}": the database name must end with "_test".`,
  );
}
