# XYZW Web Helper

<div align="center">

![XYZW Logo](public/xiaoyugan.png)

**🎮 咸鱼自动化 Web 平台 (Node 后端 + Vue 瘦前端)**

[![Vue 3](https://img.shields.io/badge/Vue-3.4+-4FC08D?style=flat&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?style=flat&logo=vite.js&logoColor=white)](https://vitejs.dev/)
[![Node 18+](https://img.shields.io/badge/Node-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-black?style=flat&logo=fastify&logoColor=white)](https://fastify.dev/)
[![WebSocket](https://img.shields.io/badge/Server_WS-BON%20Protocol-FF6B6B?style=flat&logo=websocket&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg?style=flat)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

XYZW 游戏辅助工具, 采用「**Node 后端 + Vue 瘦前端**」架构: 浏览器只负责 UI 和调用, 所有 WebSocket、BON 协议、Token 加密、任务执行都跑在 Node 进程里.

</div>

---

## ✨ 核心特性

### 🏗️ 前后端分离架构

```
浏览器 (Vue 3, UI + 配置 + 调用)
    │  REST + SSE
    ▼
Node + TypeScript + Fastify  ◄──── SQLite (tokens / role_cache / task_runs / logs)
    │
    ▼
wss://comb-platform.hortorgames.com  (游戏服, 不变)
```

### 🔐 Token 加密管理
- **AES-256-GCM** 加密所有 Token, 主密钥从启动密码经 PBKDF2 派生, 永不落盘明文
- **4 种导入方式**: 手动 / bin 文件 / URL 接口 / 微信扫码
- **服务端解密**: Token 始终在 Node 进程, 浏览器看不到明文

### 🌐 WebSocket 连接池
- 服务端维护最多 **10 个** 并发游戏 WS, **500ms** 连接间隔
- 自动重连、心跳保活、消息队列、Promise 响应匹配
- **空闲自动断连**: 无 SSE 订阅且无任务运行超过 5 分钟自动断开 (可配)
- 浏览器通过 `POST /api/tokens/:id/command` 间接发送指令

### 🔄 实时 SSE 推送
- 浏览器 `EventSource('/api/events/stream?tokenIds=...')` 订阅
- 推送: WS 状态变更 / 游戏事件 / 任务日志 / 任务进度

### 🎯 任务编排
- 日常任务 (`/api/tokens/:id/tasks/daily`)
- 批量日常任务 (`/api/batch/daily-tasks`)
- 任务运行状态、进度、日志全部入库 + SSE 推送
- 支持运行中取消

### 🎨 主题 / i18n
- 深浅主题切换 + 主题记忆 (localStorage)
- 中英文界面 (vue-i18n)

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 9 (推荐 10.19+)

### 安装与运行

```bash
# 1. 安装根目录依赖 (Vue 前端)
pnpm install

# 2. 安装 server 子项目依赖
cd server && pnpm install && cd ..

# 3. 启动 (前端 + 后端, 同时运行)
pnpm run dev:all

# 或分别启动:
pnpm run dev       # 前端 Vite (port 3000, proxy /api -> 8787)
pnpm run server    # 后端 Fastify (port 8787)
```

首次启动后端时, CLI 会提示输入 **启动密码** (用于派生 AES 主密钥). 三种方式:

1. **交互式**: 直接运行 `pnpm run server`, 在 TTY 下按提示输入密码
2. **环境变量**: `XYZW_BOOT_PASSWORD=你的密码 pnpm run server` (适合 `pnpm run dev:all` / docker 等无 TTY 场景)
3. **`.env` 文件**: 复制 `server/.env.example` 为 `server/.env`, 填入 `XYZW_BOOT_PASSWORD=...`

成功后会生成 `server/data/.session-key` (加密存储主密钥 + 密码哈希), 之后重启无需再次输入.

### 浏览器访问

打开 <http://localhost:3000> → 跳转到登录页 → 输入上面设置的启动密码 → 进入 Token 管理页.

> 也可以直接打开 <http://localhost:8787> (后端), 在没有静态资源时会返回 JSON. 若需要从同一端口访问前端, 设置 `XYZW_STATIC_DIR=../dist` 后启动.

---

## 🛠️ 开发命令

```bash
pnpm run dev          # 前端 dev (3000)
pnpm run server       # 后端 dev (8787, tsx watch)
pnpm run dev:all      # 同时跑前端 + 后端 (concurrently)

pnpm run build        # 前端打包到 dist/
pnpm run server:build # 后端 TS 编译到 server/dist/

pnpm start            # 生产: 后端启动 + 托管 dist/ 静态资源
pnpm run test         # 服务端 vitest
```

---

## 🐳 Docker 部署

```bash
cd docker
docker compose up -d
```

首启动容器需要交互式输入启动密码 (`stdin_open: true` 已配置). 数据目录 `./data` 通过 volume 持久化, 升级容器不丢失 Token.

设置 `XYZW_SESSION_PASSPHRASE` 环境变量让容器重启后自动派生主密钥 (生产必填).

---

## 📁 项目结构

```
xyzw_web_helper-main/
├── src/                 # Vue 前端 (瘦)
│   ├── api/index.ts            REST 客户端
│   ├── composables/
│   │   ├── useSseStream.ts     SSE 订阅
│   │   └── useTheme.js         主题切换
│   ├── stores/
│   │   └── tokens.ts           主 store (Pinia)
│   ├── views/                  TokenImport / Login / GameFeatures ...
│   ├── components/             UI 组件
│   ├── router/index.js         路由 + auth 守卫
│   └── utils/                  前端辅助 (与游戏无关)
│
├── server/             # Node 后端
│   ├── src/
│   │   ├── index.ts            Fastify 入口
│   │   ├── config.ts           ENV 加载
│   │   ├── crypto/vault.ts     AES-256-GCM 主密钥
│   │   ├── auth/               JWT
│   │   ├── db/                 SQLite + schema.sql
│   │   ├── api/                REST 路由
│   │   ├── events/             bus + SSE Hub
│   │   ├── game/               GameSocket + 连接池 + 事件插件
│   │   ├── token/              TokenService + authUser
│   │   ├── tasks/              Daily + Batch
│   │   └── logger.ts           pino
│   ├── data/                   SQLite + 盐值 (gitignore)
│   ├── test/                   vitest
│   ├── README.md               完整 API 文档
│   └── package.json
│
├── docker/             # Dockerfile + docker-compose
├── AGENTS.md           # 项目决策与约定 (开发前必读)
└── README.md           # 你正在看的这个
```

---

## 📖 使用指南

### 1. 登录

启动后, 首次访问会自动跳转到登录页. 输入你启动服务时设置的密码即可. 密码错误时浏览器会收到 401.

### 2. Token 导入

登录后默认进入 `/admin/tokens` (Token 管理), 选择导入方式:

| 方式 | 流程 |
|---|---|
| **手动** | 粘贴 Base64 bin (来自游戏 wx 登录) |
| **bin 文件** | 上传 .bin 文件 |
| **URL** | 粘贴 JSON API (返回 `{token: "..."}`), 服务端定时刷新 |
| **微信扫码** | 扫码后服务端会自动拉取所有角色 |

Token 入库前会自动通过 Hortor `authuser` 转换为会话凭据, AES-256-GCM 加密后写入 SQLite.

### 3. 连接 & 命令

- 列表页可对每个 Token 单独 **连接 / 断开**
- 游戏指令通过 `POST /api/tokens/:id/command` 发送, 返回 Promise 结果
- WebSocket 实际由服务端维护, 浏览器只看 SSE 推送的状态
- **游戏功能 / 批量日常** 需要至少导入一个 Token 才能进入; 无 Token 时会重定向回 Token 管理页

### 4. 任务运行

- **日常任务**: 选单个 Token → 一键补差 (25+ 子任务按序执行)
- **批量日常**: 选多个 Token → 服务端串行执行, SSE 实时进度 + 日志
- 可随时取消 (`POST /api/tasks/:runId/cancel`)

### 5. SSE 订阅

```ts
import { useSseStream } from '@/composables/useSseStream';

const { lastEvent, events, connected } = useSseStream({
  tokenIds: ['token-id-1', 'token-id-2'],
  onEvent: (evt) => {
    if (evt.type === 'game.event') console.log(evt.msg.cmd, evt.msg.body);
  },
});
```

事件类型: `ws.status` / `game.event` / `task.log` / `task.progress`.

---

## 🔐 安全说明

- **启动密码** 不会落盘明文, 但 `server/data/.session-key` 持久化了加密的主密钥 + 密码哈希
- 设置环境变量 `XYZW_SESSION_PASSPHRASE` 让容器重启后能解开 session key (生产必填)
- 浏览器永远拿不到 Token 明文, 只能调 `POST /api/tokens/:id/command` 间接执行
- 所有 SSE 流量通过 JWT 鉴权

---

## 🔧 配置 (服务端环境变量)

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址 (容器用 `0.0.0.0`) |
| `XYZW_BOOT_PASSWORD` | (空) | 首次启动密码, 设置后免去 TTY 提示 |
| `XYZW_DATA_DIR` | `./data` | SQLite + session-key 目录 |
| `XYZW_STATIC_DIR` | (空) | 若设, 托管该目录的静态资源 |
| `XYZW_WS_URL` | `wss://comb-platform.hortorgames.com` | 游戏服地址 |
| `XYZW_MAX_CONN` | `10` | WS 并发上限 |
| `XYZW_CONN_INTERVAL_MS` | `500` | 连接间隔 |
| `XYZW_JWT_TTL` | `7d` | JWT 有效期 |
| `XYZW_IDLE_TIMEOUT_MS` | `300000` | 空闲自动断连时长 (0=关闭) |
| `XYZW_SESSION_PASSPHRASE` | (内置默认) | 解 session key 的 passphrase, 部署务必替换 |

完整文档见 [server/README.md](./server/README.md).

---

## 🧪 测试

```bash
cd server
pnpm test
```

覆盖 25 个用例: BON 编解码 / vault 加解密 / transformToken / helpers / randomSeed.

---

## 📜 更新日志

### v3.1.0 (UI 精简)
- 🏠 **登录后默认进入 Token 管理** (`/admin/tokens`), 作为首页 tab
- 🔒 **游戏功能 / 批量日常需 Token 才能进入**, 无 Token 时重定向到 Token 管理
- 🗑️ **移除首页 / 注册页 / 消息测试 / WebSocket 测试**, 登录页去掉社交登录入口
- 🔌 **空闲自动断连**: 无订阅且无任务时超过 `XYZW_IDLE_TIMEOUT_MS` 自动断开
- 🧹 **清理死代码**: 删除前端遗留 wsAgent / xyzwWebSocket / randomSeed / gameCommands 等 24 个文件

### v3.0.0 (本次重构)
- 🏗️ **架构重构**: 浏览器-only → Node 后端 + Vue 瘦前端
- 🔐 **Token 加密**: 服务端 AES-256-GCM, 启动密码派生主密钥
- 🌐 **连接池**: 服务端维护 max 10 并发游戏 WS, 浏览器只调 API
- 📡 **SSE 实时推送**: ws.status / game.event / task.log / task.progress
- 🚀 **Fastify 5** + **better-sqlite3** + **原生 ws 包**
- 🗑️ **清理**: 删除 Cloudflare Worker, Python bin 服务, cocos2d-js-min.js 等 4MB 死代码

### v2.x (历史)
- Vue 3 单页应用, 浏览器直连游戏服

---

## 📄 许可证

CC-BY-NC-SA-4.0 — 仅供个人学习/研究, **禁止商业用途**.

---

## 👥 联系方式

- GitHub: <https://github.com/w1249178256/xyzw_web_helper>
- TG: <https://t.me/+SEDhXWN_OpNiMGI1>

---

<div align="center">

**⭐ Star ⭐** &nbsp; Made with ❤️

</div>