const { createDbConnection } = require("./db");
const { SERVICE_KINDS } = require("./constants");
const { syncProviders } = require("./provider-sync");
const { syncSettlements } = require("./settlement-sync");

class SyncRunner {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.timer = null;
    this.running = false;
    this.lastRun = null;
    this.lastError = null;
  }

  async runOnce() {
    if (this.running) {
      return { skipped: true, reason: "sync already running" };
    }

    this.running = true;
    const startedAt = new Date().toISOString();
    const connection = await createDbConnection(this.config);

    try {
      const providers = {
        inference: await syncProviders({ config: this.config, connection, serviceKind: SERVICE_KINDS.INFERENCE }),
        fineTuning: await syncProviders({ config: this.config, connection, serviceKind: SERVICE_KINDS.FINE_TUNING })
      };

      const settlements = {
        inference: await syncSettlements({ config: this.config, connection, serviceKind: SERVICE_KINDS.INFERENCE }),
        fineTuning: await syncSettlements({ config: this.config, connection, serviceKind: SERVICE_KINDS.FINE_TUNING })
      };

      this.lastRun = {
        startedAt,
        finishedAt: new Date().toISOString(),
        providers,
        settlements
      };
      this.lastError = null;
      return this.lastRun;
    } catch (error) {
      this.lastError = {
        at: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      };
      throw error;
    } finally {
      this.running = false;
      await connection.end();
    }
  }

  start() {
    if (this.timer) {
      return;
    }

    const tick = async () => {
      try {
        const result = await this.runOnce();
        if (!result.skipped) {
          this.logger.info(`[sync] completed at ${result.finishedAt}`);
        }
      } catch (error) {
        this.logger.error(`[sync] failed: ${error.message}`);
      }
    };

    tick();
    this.timer = setInterval(tick, this.config.sync.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStatus() {
    return {
      running: this.running,
      intervalMs: this.config.sync.intervalMs,
      startBlock: this.config.sync.startBlock,
      lastRun: this.lastRun,
      lastError: this.lastError
    };
  }
}

module.exports = {
  SyncRunner
};
