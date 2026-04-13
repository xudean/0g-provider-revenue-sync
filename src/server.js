const path = require("path");
const express = require("express");
const { loadConfig } = require("./config");
const { createDbConnection } = require("./db");
const {
  getProviderRevenueSeries,
  getRuntimeStatus,
  getSummary,
  getTopProviders,
  listProviders
} = require("./dashboard-queries");
const { SyncRunner } = require("./sync-runner");

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function main() {
  const config = loadConfig();
  if (!config.rpcUrl) {
    throw new Error("Missing RPC_URL in .env");
  }

  const app = express();
  const syncRunner = new SyncRunner(config, console);
  syncRunner.start();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "web")));

  app.get("/api/status", asyncHandler(async (_req, res) => {
    const connection = await createDbConnection(config);
    try {
      const runtime = syncRunner.getStatus();
      const dbStatus = await getRuntimeStatus(connection, config);
      res.json({ runtime, dbStatus });
    } finally {
      await connection.end();
    }
  }));

  app.post("/api/sync", async (_req, res) => {
    try {
      const result = await syncRunner.runOnce();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/summary", asyncHandler(async (_req, res) => {
    const connection = await createDbConnection(config);
    try {
      const data = await getSummary(connection, config);
      res.json(data);
    } finally {
      await connection.end();
    }
  }));

  app.get("/api/providers", asyncHandler(async (_req, res) => {
    const connection = await createDbConnection(config);
    try {
      const data = await listProviders(connection, config);
      res.json(data);
    } finally {
      await connection.end();
    }
  }));

  app.get("/api/top-providers", asyncHandler(async (req, res) => {
    const connection = await createDbConnection(config);
    try {
      const limit = Number.parseInt(String(req.query.limit || "20"), 10);
      const data = await getTopProviders(connection, config, Number.isNaN(limit) ? 20 : limit);
      res.json(data);
    } finally {
      await connection.end();
    }
  }));

  app.get("/api/revenue-series", asyncHandler(async (req, res) => {
    const connection = await createDbConnection(config);
    try {
      const bucketMinutes = Number.parseInt(
        String(req.query.bucketMinutes || config.server.defaultBucketMinutes),
        10
      );
      const data = await getProviderRevenueSeries(connection, config, {
        bucketMinutes: Number.isNaN(bucketMinutes) ? config.server.defaultBucketMinutes : bucketMinutes,
        serviceKind: req.query.serviceKind ? String(req.query.serviceKind) : null,
        providerAddress: req.query.providerAddress ? String(req.query.providerAddress) : null
      });
      res.json(data);
    } finally {
      await connection.end();
    }
  }));

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({
      message: error.message || "Internal server error"
    });
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "web", "index.html"));
  });

  app.listen(config.server.port, () => {
    console.log(`Dashboard listening on http://127.0.0.1:${config.server.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
