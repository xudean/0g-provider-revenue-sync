const { loadConfig } = require("./config");
const { SERVICE_KINDS } = require("./constants");
const { createDbConnection } = require("./db");
const { syncProviders } = require("./provider-sync");

async function main() {
  const config = loadConfig();
  if (!config.rpcUrl) {
    throw new Error("Missing RPC_URL in .env");
  }

  const connection = await createDbConnection(config);
  try {
    const inferenceCount = await syncProviders({ config, connection, serviceKind: SERVICE_KINDS.INFERENCE });
    const fineTuningCount = await syncProviders({ config, connection, serviceKind: SERVICE_KINDS.FINE_TUNING });
    console.log(`Synced providers: inference=${inferenceCount}, fine_tuning=${fineTuningCount}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
