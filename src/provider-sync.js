const { ethers } = require("ethers");
const { SERVICE_KINDS } = require("./constants");
const { resolveDeployment } = require("./contracts");
const { toJson, toLowerAddress } = require("./utils");

async function fetchInferenceProviders(contract) {
  const results = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const [services, total] = await contract.getAllServices(offset, limit);
    for (const service of services) {
      results.push({
        providerAddress: toLowerAddress(service.provider),
        serviceUrl: service.url,
        serviceType: service.serviceType,
        modelName: service.model,
        verifiability: service.verifiability,
        inputPrice: service.inputPrice.toString(),
        outputPrice: service.outputPrice.toString(),
        additionalInfo: safeParseJson(service.additionalInfo),
        teeSignerAddress: toLowerAddress(service.teeSignerAddress),
        teeSignerAcknowledged: Boolean(service.teeSignerAcknowledged),
        updatedAtOnchain: Number(service.updatedAt),
        rawServiceJson: service
      });
    }

    offset += services.length;
    if (offset >= Number(total) || services.length === 0) {
      break;
    }
  }

  return results;
}

async function fetchFineTuningProviders(contract) {
  const services = await contract.getAllServices();
  return services.map((service) => ({
    providerAddress: toLowerAddress(service.provider),
    serviceUrl: service.url,
    pricePerToken: service.pricePerToken.toString(),
    quotaJson: {
      cpuCount: service.quota.cpuCount.toString(),
      nodeMemory: service.quota.nodeMemory.toString(),
      gpuCount: service.quota.gpuCount.toString(),
      nodeStorage: service.quota.nodeStorage.toString(),
      gpuType: service.quota.gpuType
    },
    modelsJson: service.models,
    teeSignerAddress: toLowerAddress(service.teeSignerAddress),
    teeSignerAcknowledged: Boolean(service.teeSignerAcknowledged),
    occupied: Boolean(service.occupied),
    rawServiceJson: service
  }));
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return { raw: value };
  }
}

async function syncProviders({ config, connection, serviceKind }) {
  const deployment = resolveDeployment(config, serviceKind);
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const contract = new ethers.Contract(deployment.proxyAddress, deployment.abi, provider);

  const services = serviceKind === SERVICE_KINDS.INFERENCE
    ? await fetchInferenceProviders(contract)
    : await fetchFineTuningProviders(contract);

  for (const service of services) {
    await connection.execute(
      `INSERT INTO providers (
         network, service_kind, provider_address, service_url, service_type, model_name,
         verifiability, input_price, output_price, price_per_token, quota_json, models_json,
         additional_info, tee_signer_address, tee_signer_acknowledged, occupied, updated_at_onchain,
         raw_service_json, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         service_url = VALUES(service_url),
         service_type = VALUES(service_type),
         model_name = VALUES(model_name),
         verifiability = VALUES(verifiability),
         input_price = VALUES(input_price),
         output_price = VALUES(output_price),
         price_per_token = VALUES(price_per_token),
         quota_json = VALUES(quota_json),
         models_json = VALUES(models_json),
         additional_info = VALUES(additional_info),
         tee_signer_address = VALUES(tee_signer_address),
         tee_signer_acknowledged = VALUES(tee_signer_acknowledged),
         occupied = VALUES(occupied),
         updated_at_onchain = VALUES(updated_at_onchain),
         raw_service_json = VALUES(raw_service_json),
         synced_at = NOW()`,
      [
        config.network,
        serviceKind,
        service.providerAddress,
        service.serviceUrl || null,
        service.serviceType || null,
        service.modelName || null,
        service.verifiability || null,
        service.inputPrice || null,
        service.outputPrice || null,
        service.pricePerToken || null,
        service.quotaJson ? toJson(service.quotaJson) : null,
        service.modelsJson ? toJson(service.modelsJson) : null,
        service.additionalInfo ? toJson(service.additionalInfo) : null,
        service.teeSignerAddress || null,
        service.teeSignerAcknowledged ? 1 : 0,
        service.occupied === undefined ? null : (service.occupied ? 1 : 0),
        service.updatedAtOnchain || null,
        toJson(service.rawServiceJson)
      ]
    );
  }

  return services.length;
}

module.exports = {
  syncProviders
};
