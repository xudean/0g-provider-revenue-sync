function toLowerAddress(value) {
  return value ? String(value).toLowerCase() : null;
}

function stringifyBigInt(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return value.toString();
}

function jsonReplacer(_key, value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function toJson(value) {
  return JSON.stringify(value, jsonReplacer);
}

module.exports = {
  jsonReplacer,
  stringifyBigInt,
  toJson,
  toLowerAddress
};
