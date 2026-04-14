const { query, getSyncState } = require("./db");

async function getSummary(connection, config) {
  const providerCounts = await query(
    connection,
    `SELECT service_kind, COUNT(*) AS count
     FROM providers
     WHERE network = ?
     GROUP BY service_kind`,
    [config.network]
  );

  const revenueRows = await query(
    connection,
    `SELECT service_kind, COALESCE(SUM(CAST(transfer_amount AS DECIMAL(65,0))), 0) AS total_revenue
     FROM settlement_cycles
     WHERE network = ?
     GROUP BY service_kind`,
    [config.network]
  );

  const syncStateRows = await query(
    connection,
    `SELECT service_kind, sync_type, last_synced_block, updated_at
     FROM sync_state
     WHERE network = ?
     ORDER BY service_kind, sync_type`,
    [config.network]
  );

  return {
    providerCounts,
    revenueRows,
    syncStateRows
  };
}

async function listProviders(connection, config) {
  return query(
    connection,
    `SELECT
       network,
       service_kind,
       provider_address,
       service_url,
       service_type,
       model_name,
       price_per_token,
       input_price,
       output_price,
       tee_signer_address,
       tee_signer_acknowledged,
       occupied,
       updated_at_onchain,
       synced_at
     FROM providers
     WHERE network = ?
     ORDER BY service_kind, provider_address`,
    [config.network]
  );
}

async function getProviderRevenueSeries(connection, config, { bucketMinutes, serviceKind, providerAddress, anchorTime }) {
  const conditions = ["network = ?"];
  const params = [config.network];

  if (serviceKind) {
    conditions.push("service_kind = ?");
    params.push(serviceKind);
  }

  if (providerAddress) {
    conditions.push("provider_address = ?");
    params.push(providerAddress.toLowerCase());
  }

  const bucketSeconds = Math.max(60, bucketMinutes * 60);
  const normalizedAnchorTime = Number.isInteger(anchorTime) && anchorTime > 0
    ? anchorTime
    : Math.floor(Date.now() / 1000);
  const bucketOffsetSeconds = ((normalizedAnchorTime % bucketSeconds) + bucketSeconds) % bucketSeconds;

  const sql = `
    SELECT
      grouped.service_kind,
      grouped.provider_address,
      grouped.bucket_unix,
      FROM_UNIXTIME(grouped.bucket_unix) AS bucket_time,
      grouped.cycle_count,
      grouped.revenue
    FROM (
      SELECT
        bucketed.service_kind,
        bucketed.provider_address,
        bucketed.bucket_unix,
        COUNT(*) AS cycle_count,
        CAST(COALESCE(SUM(CAST(bucketed.transfer_amount AS DECIMAL(65,0))), 0) AS CHAR) AS revenue
      FROM (
        SELECT
          service_kind,
          provider_address,
          transfer_amount,
          CEIL((block_timestamp - ?) / ?) * ? + ? AS bucket_unix
        FROM settlement_cycles
        WHERE ${conditions.join(" AND ")}
      ) AS bucketed
      GROUP BY
        bucketed.service_kind,
        bucketed.provider_address,
        bucketed.bucket_unix
    ) AS grouped
    ORDER BY grouped.bucket_unix ASC, grouped.provider_address ASC
  `;

  return query(connection, sql, [
    bucketOffsetSeconds,
    bucketSeconds,
    bucketSeconds,
    bucketOffsetSeconds,
    ...params
  ]);
}

async function getTopProviders(connection, config, limit = 20) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
  return query(
    connection,
    `SELECT
       ranked.service_kind,
       ranked.provider_address,
       providers.model_name,
       ranked.total_revenue,
       ranked.cycle_count,
       ranked.first_seen,
       ranked.last_seen
     FROM (
       SELECT
         service_kind,
         provider_address,
         CAST(COALESCE(SUM(CAST(transfer_amount AS DECIMAL(65,0))), 0) AS CHAR) AS total_revenue,
         COUNT(*) AS cycle_count,
         MIN(block_timestamp) AS first_seen,
         MAX(block_timestamp) AS last_seen
       FROM settlement_cycles
       WHERE network = ?
       GROUP BY service_kind, provider_address
     ) AS ranked
     LEFT JOIN providers
       ON providers.network = ?
      AND providers.service_kind = ranked.service_kind
      AND providers.provider_address = ranked.provider_address
     ORDER BY CAST(ranked.total_revenue AS DECIMAL(65,0)) DESC
     LIMIT ${safeLimit}`,
    [config.network, config.network]
  );
}

async function getRuntimeStatus(connection, config) {
  const inference = await getSyncState(connection, config.network, "inference", "settlements");
  const fineTuning = await getSyncState(connection, config.network, "fine_tuning", "settlements");
  return {
    network: config.network,
    syncIntervalMs: config.sync.intervalMs,
    startBlock: config.sync.startBlock,
    latestSynced: {
      inference,
      fineTuning
    }
  };
}

module.exports = {
  getProviderRevenueSeries,
  getRuntimeStatus,
  getSummary,
  getTopProviders,
  listProviders
};
