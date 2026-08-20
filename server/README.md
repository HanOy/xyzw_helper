# XYZW Web Helper — 后端

Node.js + TypeScript + Fastify, 负责:

- Token 加密入库 (AES-256-GCM, 主密钥从启动密码派生)
- 连接池管理到游戏服 (`wss://comb-platform.hortorgames.com`)
- BON 协议编解码 + 命令发送
- 日常任务 / 批量任务编排
- 实时日志 + 游戏状态推送给浏览器 (SSE)

## 运行

```bash
# 首次启动会提示输入启动密码 (后续会记住)
pnpm dev

# 生产
pnpm build
pnpm start
```

依赖前端: 前端 dev 时 Vite proxy 把 `/api/*` 转发到 8787. 生产时 Fastify 静态托管 `dist/`.

## 配置 (环境变量)

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8787 | 监听端口 |
| `HOST` | 127.0.0.1 | 监听地址 (容器中改 0.0.0.0) |
| `XYZW_DATA_DIR` | `./data` | SQLite + salt + session-key 目录 |
| `XYZW_STATIC_DIR` | (无) | 若设置, 则托管该目录的静态资源 |
| `XYZW_WS_URL` | `wss://comb-platform.hortorgames.com` | 游戏服地址 |
| `XYZW_MAX_CONN` | 10 | WS 并发上限 |
| `XYZW_CONN_INTERVAL_MS` | 500 | 连接间隔 |
| `XYZW_JWT_TTL` | 7d | JWT 有效期 |
| `XYZW_SESSION_PASSPHRASE` | `xyzw-default-session-passphrase` | 用于加密磁盘上的主密钥, 部署时务必替换 |

## 目录结构

```
server/
├── src/
│   ├── index.ts            Fastify 入口
│   ├── config.ts           ENV 加载
│   ├── crypto/vault.ts     AES-256-GCM + 主密钥管理
│   ├── auth/               JWT + preHandler
│   ├── db/                 better-sqlite3 + schema.sql
│   ├── api/                REST 路由
│   ├── events/             进程内 EventEmitter + SSE Hub
│   ├── game/               GameSocket / ConnectionPool / 事件插件
│   ├── token/              TokenService + authUser 协议
│   ├── tasks/              任务编排 (Daily/Batch)
│   └── logger.ts           pino
├── data/                   SQLite + 会话密钥 (gitignore)
├── test/                   vitest
├── tsconfig.json
└── package.json
```

## REST API 速查

```
POST   /api/auth/login               body: {password} → {token}
GET    /api/auth/me

GET    /api/tokens                   Token 列表
POST   /api/tokens                   导入 (manual/bin/url/wxQrcode)
GET    /api/tokens/:id
PATCH  /api/tokens/:id               改名 / 备注 / wsUrl
DELETE /api/tokens/:id
POST   /api/tokens/:id/refresh       URL 类型重新拉取
POST   /api/tokens/:id/connect
POST   /api/tokens/:id/disconnect
GET    /api/tokens/:id/status
GET    /api/tokens/:id/data          缓存的角色/军团/塔/学习数据
POST   /api/tokens/:id/command       body: {cmd, params, timeoutMs?}
POST   /api/tokens/:id/tasks/daily   body: {settings?} → {runId}
POST   /api/tasks/:runId/cancel
GET    /api/tasks/:runId
GET    /api/tasks?tokenId=

POST   /api/batch/daily-tasks        body: {tokenIds, settings?}
POST   /api/batch/:batchId/stop

GET    /api/events/stream            SSE (tokenIds 过滤)
GET    /api/logs?tokenId=&runId=&page=
GET    /api/health
```

## SSE 事件

```ts
type SseEvent =
  | {type:'ws.status',     tokenId, status, error?}
  | {type:'game.event',    tokenId, cmd, body}
  | {type:'task.log',      runId, tokenId?, level, message, ts}
  | {type:'task.progress', runId, current, total, stage?}
```

## 测试

```bash
pnpm test
```

覆盖: BON 编解码 / vault 加解密 / transformToken / helpers / randomSeed.

## Docker

```bash
cd docker
docker compose up -d
```

首启动会要求设置启动密码 (容器需要 `stdin_open: true`).
`data/` 目录通过 volume 持久化, 升级容器不丢失 Token.

## 迁移自旧版本

旧版本是「浏览器-only」+ Python Flask bin 服务. 新版本不再需要 Python bin 服务和
Cloudflare Worker, 全部由本 Node 进程处理. 历史 Token 数据需要重新导入.