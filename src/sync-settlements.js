const { loadConfig } = require("./config");
const { SERVICE_KINDS } = require("./constants");
const { createDbConnection } = require("./db");
const { syncSettlements } = require("./settlement-sync");

async function main() {
  const config = loadConfig();
  if (!config.rpcUrl) {
    throw new Error("Missing RPC_URL in .env");
  }

  const connection = await createDbConnection(config);
  try {
    const inference = await syncSettlements({ config, connection, serviceKind: SERVICE_KINDS.INFERENCE });
    const fineTuning = await syncSettlements({ config, connection, serviceKind: SERVICE_KINDS.FINE_TUNING });

    console.log("Settlement sync finished");
    console.log(JSON.stringify({ inference, fineTuning }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
