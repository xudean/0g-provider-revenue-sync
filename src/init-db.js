const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");
const { createServerConnection } = require("./db");

async function main() {
  const config = loadConfig();
  const sqlPath = path.join(__dirname, "..", "sql", "init.sql");
  const sql = fs.readFileSync(sqlPath, "utf8")
    .replace(/og_compute_revenue/g, config.mysql.database);

  const connection = await createServerConnection(config);
  try {
    await connection.query(sql);
    console.log(`Initialized MySQL schema: ${config.mysql.database}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
