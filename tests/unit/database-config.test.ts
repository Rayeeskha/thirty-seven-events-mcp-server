import { describe, expect, it, jest } from "@jest/globals";
import { Options, Sequelize } from "sequelize";

function loadSequelize(dbLogging: string) {
  process.env.DB_LOGGING = dbLogging;
  let loaded: typeof import("../../src/config/database") | undefined;
  jest.isolateModules(() => {
    loaded = require("../../src/config/database");
  });
  return loaded!.sequelize;
}

/** Sequelize keeps its constructor options at runtime but omits them from the public typings. */
const optionsOf = (sequelize: Sequelize): Options =>
  (sequelize as unknown as { options: Options }).options;

describe("database configuration", () => {
  it("does not log SQL by default", async () => {
    const sequelize = loadSequelize("false");
    expect(optionsOf(sequelize).logging).toBe(false);
    await sequelize.close();
  });

  it("logs SQL through the application logger when DB_LOGGING=true", async () => {
    const sequelize = loadSequelize("true");
    expect(typeof optionsOf(sequelize).logging).toBe("function");
    expect(() =>
      (optionsOf(sequelize).logging as (sql: string) => void)("SELECT 1"),
    ).not.toThrow();
    await sequelize.close();
  });

  it("applies the configured connection pool limits", async () => {
    process.env.DB_POOL_MAX = "12";
    process.env.DB_POOL_MIN = "2";
    process.env.DB_POOL_IDLE_MS = "15000";
    process.env.DB_POOL_ACQUIRE_MS = "30000";
    const sequelize = loadSequelize("false");
    expect(optionsOf(sequelize).pool).toMatchObject({
      max: 12,
      min: 2,
      idle: 15000,
      acquire: 30000,
    });
    await sequelize.close();
  });

  it("uses explicit pool defaults when pool variables are absent", async () => {
    delete process.env.DB_POOL_MAX;
    delete process.env.DB_POOL_MIN;
    delete process.env.DB_POOL_IDLE_MS;
    delete process.env.DB_POOL_ACQUIRE_MS;
    const sequelize = loadSequelize("false");
    expect(optionsOf(sequelize).pool).toMatchObject({
      max: 5,
      min: 0,
      idle: 10000,
      acquire: 60000,
    });
    await sequelize.close();
  });

  it("connects to the configured test database with utf8mb4", async () => {
    const sequelize = loadSequelize("false");
    expect(sequelize.getDatabaseName()).toMatch(/_test$/);
    expect(optionsOf(sequelize).define).toMatchObject({
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
    });
    await expect(sequelize.authenticate()).resolves.toBeUndefined();
    await sequelize.close();
  });
});

describe("stored proposal payload", () => {
  const { PendingOperationModel } =
    require("../../src/database/models/pending-operation.model") as typeof import("../../src/database/models/pending-operation.model");
  const build = (payload: unknown) =>
    PendingOperationModel.build({
      id: "x",
      token_hash: "h",
      operation_type: "CREATE_EVENT",
      payload: payload as object,
      payload_hash: "p",
      expires_at: new Date(),
    });

  it("is returned as an object when the driver gives an object", () => {
    expect(build({ event_id: 8 }).payload).toEqual({ event_id: 8 });
  });

  it("is parsed into an object when the driver gives JSON text", () => {
    expect(build('{"event_id":8,"status":"COMPLETED"}').payload).toEqual({
      event_id: 8,
      status: "COMPLETED",
    });
  });
});
