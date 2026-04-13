const { ethers } = require("ethers");
const { INFERENCE_STATUS_LABELS, SERVICE_KINDS } = require("./constants");
const { resolveDeployment } = require("./contracts");
const { getSyncState, setSyncState } = require("./db");
const { stringifyBigInt, toJson, toLowerAddress } = require("./utils");

async function syncSettlements({ config, connection, serviceKind }) {
  const deployment = resolveDeployment(config, serviceKind);
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const contract = new ethers.Contract(deployment.proxyAddress, deployment.abi, provider);

  const latestBlock = config.sync.endBlock ?? await provider.getBlockNumber();
  const lastSynced = await getSyncState(connection, config.network, serviceKind, "settlements");
  let fromBlock;
  if (lastSynced !== null) {
    fromBlock = lastSynced + 1;
  } else if (config.sync.startBlock !== null) {
    fromBlock = config.sync.startBlock;
  } else {
    fromBlock = 0;
  }

  if (fromBlock > latestBlock) {
    return { fromBlock, toBlock: latestBlock, records: 0, cycles: 0, lastSyncedBlock: lastSynced };
  }

  let records = 0;
  let cycles = 0;
  const batchSize = config.sync.blockBatchSize;

  for (let start = fromBlock; start <= latestBlock; start += batchSize) {
    const end = Math.min(start + batchSize - 1, latestBlock);
    const result = serviceKind === SERVICE_KINDS.INFERENCE
      ? await syncInferenceBatch({ provider, contract, deployment, connection, config, start, end })
      : await syncFineTuningBatch({ provider, contract, deployment, connection, config, start, end });

    records += result.records;
    cycles += result.cycles;
    await setSyncState(connection, config.network, serviceKind, "settlements", end);
  }

  return { fromBlock, toBlock: latestBlock, records, cycles, lastSyncedBlock: latestBlock };
}

async function syncInferenceBatch({ provider, contract, deployment, connection, config, start, end }) {
  const filter = contract.filters.TEESettlementResult();
  const logs = await contract.queryFilter(filter, start, end);
  if (logs.length === 0) {
    return { records: 0, cycles: 0 };
  }

  const byTx = new Map();
  for (const log of logs) {
    const txLogs = byTx.get(log.transactionHash) || [];
    txLogs.push(log);
    byTx.set(log.transactionHash, txLogs);
  }

  let records = 0;
  let cycles = 0;
  const iface = contract.interface;

  for (const [txHash, txLogs] of byTx.entries()) {
    txLogs.sort((a, b) => a.index - b.index);

    const tx = await provider.getTransaction(txHash);
    const block = await provider.getBlock(tx.blockNumber);
    const decoded = iface.decodeFunctionData("settleFeesWithTEE", tx.data);
    const settlements = decoded[0];
    const providerAddress = settlements.length > 0
      ? toLowerAddress(settlements[0].provider)
      : toLowerAddress(tx.from);

    let txTransferAmount = 0n;
    const cycleItems = [];

    for (let i = 0; i < txLogs.length; i += 1) {
      const log = txLogs[i];
      const settlement = settlements[i];
      const statusCode = Number(log.args.status);
      const unsettledAmount = BigInt(log.args.unsettledAmount.toString());
      const requestedAmount = BigInt(settlement.totalFee.toString());
      const transferAmount = statusCode === 0 || statusCode === 1
        ? requestedAmount - unsettledAmount
        : 0n;

      txTransferAmount += transferAmount;
      cycleItems.push({
        network: config.network,
        serviceKind: SERVICE_KINDS.INFERENCE,
        contractAddress: toLowerAddress(deployment.proxyAddress),
        providerAddress,
        userAddress: toLowerAddress(settlement.user),
        txHash,
        logIndex: log.index,
        blockNumber: tx.blockNumber,
        blockTimestamp: block.timestamp,
        eventName: "TEESettlementResult",
        statusCode,
        statusLabel: INFERENCE_STATUS_LABELS[statusCode] || "UNKNOWN",
        requestedAmount: stringifyBigInt(requestedAmount),
        unsettledAmount: stringifyBigInt(unsettledAmount),
        transferAmount: stringifyBigInt(transferAmount),
        settlementNonce: stringifyBigInt(settlement.nonce),
        requestsHash: settlement.requestsHash,
        rawEventJson: {
          log: log.args,
          settlement
        }
      });
    }

    await upsertSettlementCycle(connection, {
      network: config.network,
      serviceKind: SERVICE_KINDS.INFERENCE,
      contractAddress: toLowerAddress(deployment.proxyAddress),
      providerAddress,
      txHash,
      blockNumber: tx.blockNumber,
      blockTimestamp: block.timestamp,
      itemCount: cycleItems.length,
      transferAmount: stringifyBigInt(txTransferAmount),
      rawSummaryJson: {
        txHash,
        providerAddress,
        itemCount: cycleItems.length,
        transferAmount: stringifyBigInt(txTransferAmount)
      }
    });

    for (const item of cycleItems) {
      await upsertSettlementItem(connection, item);
    }

    records += cycleItems.length;
    cycles += 1;
  }

  return { records, cycles };
}

async function syncFineTuningBatch({ provider, contract, deployment, connection, config, start, end }) {
  const filter = contract.filters.FeesSettled();
  const logs = await contract.queryFilter(filter, start, end);
  if (logs.length === 0) {
    return { records: 0, cycles: 0 };
  }

  const byTx = new Map();
  for (const log of logs) {
    const txLogs = byTx.get(log.transactionHash) || [];
    txLogs.push(log);
    byTx.set(log.transactionHash, txLogs);
  }

  let records = 0;
  let cycles = 0;

  for (const [txHash, txLogs] of byTx.entries()) {
    txLogs.sort((a, b) => a.index - b.index);
    const block = await provider.getBlock(txLogs[0].blockNumber);
    const providerAddress = toLowerAddress(txLogs[0].args.provider);
    let txTransferAmount = 0n;

    for (const log of txLogs) {
      const fee = BigInt(log.args.fee.toString());
      txTransferAmount += fee;

      await upsertSettlementItem(connection, {
        network: config.network,
        serviceKind: SERVICE_KINDS.FINE_TUNING,
        contractAddress: toLowerAddress(deployment.proxyAddress),
        providerAddress,
        userAddress: toLowerAddress(log.args.user),
        txHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        blockTimestamp: block.timestamp,
        eventName: "FeesSettled",
        transferAmount: stringifyBigInt(fee),
        fee: stringifyBigInt(fee),
        deliverableId: log.args.deliverableId,
        acknowledged: Boolean(log.args.acknowledged),
        settlementNonce: stringifyBigInt(log.args.nonce),
        rawEventJson: log.args
      });
    }

    await upsertSettlementCycle(connection, {
      network: config.network,
      serviceKind: SERVICE_KINDS.FINE_TUNING,
      contractAddress: toLowerAddress(deployment.proxyAddress),
      providerAddress,
      txHash,
      blockNumber: txLogs[0].blockNumber,
      blockTimestamp: block.timestamp,
      itemCount: txLogs.length,
      transferAmount: stringifyBigInt(txTransferAmount),
      rawSummaryJson: {
        txHash,
        providerAddress,
        itemCount: txLogs.length,
        transferAmount: stringifyBigInt(txTransferAmount)
      }
    });

    records += txLogs.length;
    cycles += 1;
  }

  return { records, cycles };
}

async function upsertSettlementCycle(connection, cycle) {
  await connection.execute(
    `INSERT INTO settlement_cycles (
       network, service_kind, contract_address, provider_address, tx_hash, block_number,
       block_timestamp, item_count, transfer_amount, raw_summary_json, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       contract_address = VALUES(contract_address),
       provider_address = VALUES(provider_address),
       block_number = VALUES(block_number),
       block_timestamp = VALUES(block_timestamp),
       item_count = VALUES(item_count),
       transfer_amount = VALUES(transfer_amount),
       raw_summary_json = VALUES(raw_summary_json),
       synced_at = NOW()`,
    [
      cycle.network,
      cycle.serviceKind,
      cycle.contractAddress,
      cycle.providerAddress,
      cycle.txHash,
      cycle.blockNumber,
      cycle.blockTimestamp,
      cycle.itemCount,
      cycle.transferAmount,
      toJson(cycle.rawSummaryJson)
    ]
  );
}

async function upsertSettlementItem(connection, item) {
  await connection.execute(
    `INSERT INTO settlement_items (
       network, service_kind, contract_address, provider_address, user_address, tx_hash, log_index,
       block_number, block_timestamp, event_name, status_code, status_label, requested_amount,
       unsettled_amount, transfer_amount, fee, deliverable_id, acknowledged, settlement_nonce,
       requests_hash, raw_event_json, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       provider_address = VALUES(provider_address),
       user_address = VALUES(user_address),
       block_number = VALUES(block_number),
       block_timestamp = VALUES(block_timestamp),
       event_name = VALUES(event_name),
       status_code = VALUES(status_code),
       status_label = VALUES(status_label),
       requested_amount = VALUES(requested_amount),
       unsettled_amount = VALUES(unsettled_amount),
       transfer_amount = VALUES(transfer_amount),
       fee = VALUES(fee),
       deliverable_id = VALUES(deliverable_id),
       acknowledged = VALUES(acknowledged),
       settlement_nonce = VALUES(settlement_nonce),
       requests_hash = VALUES(requests_hash),
       raw_event_json = VALUES(raw_event_json),
       synced_at = NOW()`,
    [
      item.network,
      item.serviceKind,
      item.contractAddress,
      item.providerAddress,
      item.userAddress,
      item.txHash,
      item.logIndex,
      item.blockNumber,
      item.blockTimestamp,
      item.eventName,
      item.statusCode ?? null,
      item.statusLabel ?? null,
      item.requestedAmount ?? null,
      item.unsettledAmount ?? null,
      item.transferAmount,
      item.fee ?? null,
      item.deliverableId ?? null,
      item.acknowledged === undefined ? null : (item.acknowledged ? 1 : 0),
      item.settlementNonce ?? null,
      item.requestsHash ?? null,
      toJson(item.rawEventJson)
    ]
  );
}

module.exports = {
  syncSettlements
};
