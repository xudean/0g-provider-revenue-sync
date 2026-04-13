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

- `CONTRACT_DEPLOYMENTS_DIR`: 合约部署 JSON 目录；默认读取当前项目内的 `deployments/`
- `START_BLOCK`: 首次同步起始块
- `END_BLOCK`: 截止块，不填则同步到最新块
- `BLOCK_BATCH_SIZE`: 每批扫块范围，默认 `2000`
- `SYNC_INTERVAL_MS`: 后台自动同步周期，默认 `10000`
- `SERVER_PORT`: dashboard 服务端口，默认 `3200`
- `DEFAULT_BUCKET_MINUTES`: dashboard 默认时间桶，默认 `60`
- `APP_HOST_PORT`: Docker 映射到宿主机的 dashboard 端口，默认 `3201`
- `MYSQL_HOST_PORT`: Docker 映射到宿主机的 MySQL 端口，默认 `3307`

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

## Docker

项目已提供：

- `Dockerfile`
- `docker-compose.yml`

启动前先确认两个条件：

1. `.env` 里至少配置好 `RPC_URL` 和 `NETWORK`
2. `.env` 如需覆盖 ABI/部署文件目录，可设置 `CONTRACT_DEPLOYMENTS_DIR`

直接启动：

```bash
docker compose up --build -d
```

访问：

```bash
http://127.0.0.1:3201
```

说明：

- `docker-compose.yml` 会同时启动应用和 `MySQL`
- 应用容器启动时会自动循环执行 `init-db`，直到 `MySQL` 就绪
- Compose 内部会把 `MYSQL_HOST` 覆盖成 `mysql`，所以不需要改你本地 `.env`
- 镜像会直接包含当前项目下的 `deployments/`，不再依赖额外兄弟目录
- 宿主机默认映射为 `3201 -> app:3200`、`3307 -> mysql:3306`，如有冲突可改 `.env` 中的 `APP_HOST_PORT` 和 `MYSQL_HOST_PORT`
- `MySQL` 数据保存在命名卷 `mysql_data`
