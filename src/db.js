const mysql = require("mysql2/promise");

async function createServerConnection(config) {
  return mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    multipleStatements: true
  });
}

async function createDbConnection(config) {
  return mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    multipleStatements: true
  });
}

async function getSyncState(connection, network, serviceKind, syncType) {
  const [rows] = await connection.execute(
    `SELECT last_synced_block
     FROM sync_state
     WHERE network = ? AND service_kind = ? AND sync_type = ?`,
    [network, serviceKind, syncType]
  );

  return rows.length ? Number(rows[0].last_synced_block) : null;
}

async function setSyncState(connection, network, serviceKind, syncType, lastSyncedBlock) {
  await connection.execute(
    `INSERT INTO sync_state (network, service_kind, sync_type, last_synced_block)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_synced_block = VALUES(last_synced_block)`,
    [network, serviceKind, syncType, lastSyncedBlock]
  );
}

async function query(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return rows;
}

module.exports = {
  createDbConnection,
  createServerConnection,
  getSyncState,
  query,
  setSyncState
};
