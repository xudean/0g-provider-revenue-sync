const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONTRACT_DEPLOYMENTS_DIR = path.join(ROOT_DIR, "deployments");

const SERVICE_KINDS = {
  INFERENCE: "inference",
  FINE_TUNING: "fine_tuning"
};

const INFERENCE_STATUS_LABELS = {
  0: "SUCCESS",
  1: "PARTIAL",
  2: "PROVIDER_MISMATCH",
  3: "NO_TEE_SIGNER",
  4: "INVALID_NONCE",
  5: "INVALID_SIGNATURE"
};

module.exports = {
  CONTRACT_DEPLOYMENTS_DIR,
  INFERENCE_STATUS_LABELS,
  SERVICE_KINDS
};
