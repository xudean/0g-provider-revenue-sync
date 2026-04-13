# 0G Provider Revenue Sync

使用 `ethers.js` 从 0G Compute 合约同步两类数据到 MySQL：

- provider 服务信息
- provider 每次结算周期收到的金额

支持：

- `InferenceServing`
- `FineTuningServing`

## 目录

- `providers`: 当前链上 provider 信息
- `settlement_cycles`: 每笔结算交易汇总后的 provider 收入
- `settlement_items`: 每条结算 event 明细
- `sync_state`: 增量同步进度

## 配置

先复制配置文件：

```bash
cp .env.example .env
```

默认 MySQL 配置已经按本机参数写好：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=root123
MYSQL_DATABASE=og_compute_revenue
```

你需要至少补充：

```env
RPC_URL=你的 0G RPC
NETWORK=zgMainnet
```

可选：

- `START_BLOCK`: 首次同步起始块
- `END_BLOCK`: 截止块，不填则同步到最新块
- `BLOCK_BATCH_SIZE`: 每批扫块范围，默认 `2000`
- `SYNC_INTERVAL_MS`: 后台自动同步周期，默认 `10000`
- `SERVER_PORT`: dashboard 服务端口，默认 `3200`
- `DEFAULT_BUCKET_MINUTES`: dashboard 默认时间桶，默认 `60`

## 安装

```bash
npm install
```

## 初始化数据库

```bash
npm run init-db
```

## 同步 provider

```bash
npm run sync-providers
```

## 同步结算

```bash
npm run sync-settlements
```

## 全量执行

```bash
npm run sync-all
```

## 启动定时同步 + Dashboard

```bash
npm start
```

打开：

```bash
http://127.0.0.1:3200
```

服务行为：

- 启动后立即同步一次
- 然后每 `SYNC_INTERVAL_MS` 自动继续同步
- `START_BLOCK` 只在数据库里还没有 `sync_state` 时生效
- 一旦某类数据已有 `sync_state.last_synced_block`，后续始终从 `last_synced_block + 1` 开始
- `settlement_cycles` 和 `settlement_items` 都有唯一键，重复扫同一笔交易也只会做 upsert，不会重复插入

## 说明

`fine-tuning` 直接使用链上 `FeesSettled` event 的 `fee` 作为本次结算金额。

`inference` 不直接在 event 中给出转账金额。脚本会：

1. 拉取 `TEESettlementResult`
2. 解码 `settleFeesWithTEE` 交易输入里的 `totalFee`
3. 用 `totalFee - unsettledAmount` 计算实际转给 provider 的金额

`settlement_cycles.transfer_amount` 是按一笔交易聚合后的 provider 收入。

Dashboard 页面提供：

- 当前同步状态
- provider 数量与累计收益概览
- Top provider 表格
- 按时间桶聚合的 provider 收益图
- 手动触发一次即时同步
