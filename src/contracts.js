const fs = require("fs");
const path = require("path");
const { SERVICE_KINDS } = require("./constants");

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveDeployment(config, serviceKind) {
  const fileMap = {
    [SERVICE_KINDS.INFERENCE]: {
      proxy: "InferenceServing_v1.0.json",
      implCandidates: ["InferenceServing_v1.0Impl.json"]
    },
    [SERVICE_KINDS.FINE_TUNING]: {
      proxy: "FineTuningServing_v1.0.json",
      implCandidates: ["FineTuningServing_v1.1Impl.json", "FineTuningServing_v1.0Impl.json"]
    }
  };

  const entry = fileMap[serviceKind];
  if (!entry) {
    throw new Error(`Unsupported service kind: ${serviceKind}`);
  }

  const proxyPath = path.join(config.deploymentDir, entry.proxy);
  if (!fs.existsSync(proxyPath)) {
    throw new Error(`Missing proxy deployment file: ${proxyPath}`);
  }
  const proxy = loadJson(proxyPath);

  let impl;
  let implPath;
  for (const candidate of entry.implCandidates) {
    const currentPath = path.join(config.deploymentDir, candidate);
    if (fs.existsSync(currentPath)) {
      implPath = currentPath;
      impl = loadJson(currentPath);
      break;
    }
  }

  if (!impl) {
    throw new Error(`Missing implementation deployment for ${serviceKind} in ${config.deploymentDir}`);
  }

  return {
    serviceKind,
    proxyAddress: proxy.address,
    implementationAddress: impl.address,
    abi: impl.abi,
    proxyPath,
    implPath
  };
}

module.exports = {
  resolveDeployment
};
