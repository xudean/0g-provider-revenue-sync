const path = require("path");
const dotenv = require("dotenv");
const { CONTRACT_DEPLOYMENTS_DIR } = require("./constants");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

function parseOptionalInt(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

function loadConfig() {
  const network = process.env.NETWORK || "zgTestnetV4";
  const deploymentsRoot = process.env.CONTRACT_DEPLOYMENTS_DIR || CONTRACT_DEPLOYMENTS_DIR;

  return {
    rpcUrl: process.env.RPC_URL,
    network,
    deploymentDir: path.join(deploymentsRoot, network),
    mysql: {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: parseOptionalInt(process.env.MYSQL_PORT, 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "root123",
      database: process.env.MYSQL_DATABASE || "og_compute_revenue"
    },
    sync: {
      startBlock: parseOptionalInt(process.env.START_BLOCK, null),
      endBlock: parseOptionalInt(process.env.END_BLOCK, null),
      blockBatchSize: parseOptionalInt(process.env.BLOCK_BATCH_SIZE, 2000),
      intervalMs: parseOptionalInt(process.env.SYNC_INTERVAL_MS, 10000)
    },
    server: {
      port: parseOptionalInt(process.env.SERVER_PORT, 3200),
      defaultBucketMinutes: parseOptionalInt(process.env.DEFAULT_BUCKET_MINUTES, 60)
    }
  };
}

module.exports = {
  loadConfig
};
