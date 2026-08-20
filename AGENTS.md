# AGENTS.md

> 项目改造决策与开发规约。本文由 opencode 维护，所有会话开始时应先阅读本文件。

## 项目架构

本项目为 **XYZW 游戏辅助工具**，已经完成从「浏览器-only」到「Node 后端 + Vue 瘦前端」的重构：

```
浏览器 (Vue 3, 只读/配置)
    │  REST + SSE
    ▼
Node + TypeScript + Fastify  ◄──── SQLite (tokens / role_cache / task_runs / logs)
    │
    ▼
wss://comb-platform.hortorgames.com  (游戏服, 不变)
```

- **前端** (`src/`) 只负责 UI、表单、主题、调用后端 API、订阅 SSE
- **后端** (`server/`) 持有所有 Token、WebSocket 连接、游戏状态、任务编排

## 锁定决策 (不再讨论)

| 项 | 选择 | 备注 |
|---|---|---|
| 服务端运行时 | Node.js >= 18 | |
| 服务端语言 | TypeScript | tsconfig.server.json |
| HTTP 框架 | Fastify | @fastify/jwt, @fastify/cors, @fastify/sse |
| 服务端→游戏服 WS | 原生 `ws` 包 | 不经浏览器 |
| 服务端→浏览器推送 | SSE (`/api/events/stream`) | 单向，浏览器 EventSource |
| 持久化 | better-sqlite3 | server/data/app.db (gitignore) |
| 鉴权 | 单用户 + 启动密码 | 首次启动 CLI 输入；PBKDF2 派生 AES key |
| Token 加密 | AES-256-GCM | 主密钥从启动密码派生, IV 随机 |
| 任务队列 | p-queue (前端已有) | 服务端用同款 |
| 日志 | pino | 写入文件 + SSE 推前端 |
| 旧 Python bin 服务 | 删除 | 用户自建 URL 端点 |
| Cloudflare worker.js | 删除 | |
| src/xyzw/ (1.7M + 2.3M) | 删除 | 是 cocos2d-js-min.js 和游戏入口, 死代码 |

## 开发命令

```bash
# 安装
pnpm install

# 同时启动前端 (3000) + 后端 (8787)
pnpm run dev:all

# 或分别启动
pnpm run dev         # 前端 (Vite, port 3000, proxy /api → 8787)
pnpm run server      # 后端 (Fastify, port 8787)

# 构建
pnpm run build       # 前端打包到 dist/
pnpm run server:build # 后端 TS 编译到 server/dist/

# 生产运行
pnpm start           # 后端启动, 同时托管 dist/ 静态资源

# 测试
pnpm run test        # vitest 跑全部
```

## 端口约定

- 3000: 前端 Vite dev
- 8787: 后端 Fastify (REST + SSE + 静态托管)
- 前端 dev 时 Vite proxy 把 `/api/*` 转发到 8787

## 关键文件路径

```
server/src/index.ts                  # 入口
server/src/config.ts                 # ENV 配置
server/src/db/schema.sql             # 建表 SQL
server/src/crypto/vault.ts           # Token 加解密
server/src/auth/session.ts           # JWT 签发
server/src/api/token.routes.ts       # /api/tokens/*
server/src/api/game.routes.ts        # /api/tokens/:id/{connect,command,data,...}
server/src/api/task.routes.ts        # /api/tokens/:id/tasks/*
server/src/api/batch.routes.ts       # /api/batch/*
server/src/api/auth.routes.ts        # /api/auth/*
server/src/api/logs.routes.ts        # /api/logs
server/src/events/bus.ts             # 进程内 EventEmitter
server/src/events/sseHub.ts          # SSE 多客户端
server/src/game/bonProtocol.ts       # BON 协议 (原 src/utils/bonProtocol.js)
server/src/game/GameSocket.ts        # 游戏 WS 客户端 (原 wsAgent.js + xyzwWebSocket.js)
server/src/game/ConnectionPool.ts    # 连接池 (原 tokenStore + batch/connectionManager.js)
server/src/game/wxLogin.ts           # 微信扫码登录服务 (crypto + comb-login + bin 生成)
server/src/game/events/*.ts          # 事件插件 (原 src/stores/events/*.ts)
server/src/token/TokenService.ts     # Token 业务 (原 src/stores/tokenStore.ts)
server/src/tasks/DailyTaskRunner.ts  # 日常任务 (原 src/utils/dailyTaskRunner.js)
server/src/tasks/batch/*.ts          # 批量任务 (原 src/utils/batch/*)

src/api/index.js                     # 真实 REST 客户端
src/composables/useSseStream.ts      # SSE 订阅封装
src/stores/changelogStore.js         # 前端 UI 状态, 保留
```

## 前端目录现状 (改造后)

```
src/
├── api/index.js                     # ★ 改: 真实 REST
├── composables/
│   ├── useSseStream.ts              # ★ 新
│   └── useTheme.js                  # 保留
├── stores/
│   └── changelogStore.js            # 仅保留 UI 状态
├── views/                           # 改: 所有 gameData 改 SSE 订阅
├── components/                      # 改: 删 wsAgent/xyzwWebSocket 引用
├── router/index.js                  # 改: requiresToken 走 /api/auth/me
├── utils/                           # 仅留前端工具 (imageExport 等)
└── locales/
```

## 后端目录结构 (新建)

```
server/
├── src/                              # TS 源码
│   ├── index.ts                      # Fastify 启动 + 注册插件
│   ├── config.ts                     # 读取 ENV / 启动密码
│   ├── db/
│   │   ├── index.ts                  # better-sqlite3 实例 + 迁移
│   │   └── schema.sql                # tokens / role_cache / task_runs / task_logs / ws_connections / settings
│   ├── crypto/vault.ts               # AES-256-GCM 加解密
│   ├── auth/
│   │   ├── session.ts                # JWT
│   │   └── middleware.ts             # Fastify preHandler
│   ├── api/                          # 路由
│   ├── events/                       # bus + sseHub
│   ├── game/                         # 协议 / WS / 连接池 / 事件插件
│   ├── token/                        # Token 服务
│   ├── tasks/                        # 任务编排 (含 batch/)
│   ├── util/                         # 纯函数工具 (DateTime, HeroList, ...)
│   └── logger.ts                     # pino
├── data/                             # SQLite + 盐 (gitignore)
├── test/                             # vitest
├── tsconfig.json
├── package.json
└── README.md
```

## 鉴权约定

- **首次启动**: 没有 `server/data/.session-key` 时, 优先读取 `XYZW_BOOT_PASSWORD` 环境变量; 否则在 TTY 下提示输入启动密码; 非 TTY 环境会立即报错并给出解决方案
- **持久化**: 启动密码经 PBKDF2 派生 AES-256-GCM 主密钥, 用 `XYZW_SESSION_PASSPHRASE` (默认内置, 部署务必替换) 加密后写入 `data/.session-key`
- **登录**: `POST /api/auth/login` body `{password}` → 验证后签发 JWT
- **JWT** 载荷: `{sub: 'admin', iat, exp}`, 签名密钥 = 进程内随机 (每次启动不同, 旧 token 失效)
- **前端**: 启动时检查 localStorage 有无 token; 无则跳 `/login`; 有则带 `Authorization: Bearer` 调 `/api/auth/me` 探活
- **自动重登**: 401 响应时清除本地 token 跳 `/login`

## Token 加密约定

```ts
// 主密钥
masterKey = PBKDF2(SHA-256, password, salt, 100000, 32 bytes)
// 入库
encrypted = AES-256-GCM(masterKey, iv_random, plaintext_token)
stored = base64(encrypted.ciphertext || encrypted.iv || encrypted.authTag)
// 出库
plaintext_token = AES-256-GCM-decrypt(masterKey, stored)
```

## SSE 事件约定

```ts
type SseEvent =
  | {type: 'ws.status',  tokenId, status}
  | {type: 'game.event',  tokenId, cmd, body}
  | {type: 'task.log',    runId, level, message, ts}
  | {type: 'task.progress', runId, current, total, stage}
  | {type: 'game.data',   tokenId, section: 'role'|'legion'|'tower'|'study', data}
```

前端订阅: `EventSource('/api/events/stream?tokenIds=id1,id2')`

## 并发与限流

- WS 连接池: max 10 并发, 500ms 间隔 (可配置)
- 任务运行: 同 token 串行, 跨 token 受 WS 池约束
- 任务取消: 写 `task_runs.cancelled_at`, runner 主循环检查

## 代码风格

- 服务端 TypeScript strict
- 前端沿用 Vue 3 + Pinia + Composition API
- ESM (`"type": "module"` in package.json)
- 不添加注释除非必要

## 测试

- 服务端: vitest 跑 `server/test/*.test.ts`
- 重点覆盖: token 加解密、BON 编解码、transformToken (Base64 解析)、连接池限流
- 前端不写测试 (历史如此)

## 常见改动路径

- 新增 REST endpoint → `server/src/api/*.routes.ts` + 注册到 `server/src/index.ts`
- 新增游戏事件 → `server/src/game/events/<feature>.ts` 注册到 `index.ts`
- 新增批量任务 → `server/src/tasks/batch/tasks<X>.ts` 在 `index.ts` 注册
- 前端调接口 → `src/api/index.js` 加方法 + 组件调用
- 前端订阅实时数据 → `useSseStream` + 组件 ref