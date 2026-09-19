# 本机开发与运行

## 1. 环境

- Node.js 24。
- pnpm 11，由 corepack 管理；无需另外全局安装 pnpm，项目启动脚本统一通过 `corepack pnpm` 调用。
- 本机数据库使用 PGlite，数据目录 `.local-data/pglite`。
- 环境变量从项目根目录 `.env` 读取。

## 2. 第一次启动

安装 Node.js 24 后，直接双击项目根目录的 `启动系统.cmd`。工具会自动检查 Node.js、corepack、依赖、环境变量和三个服务端口；依赖缺失时会自动安装。

如果 `.env` 不存在，工具会从 `.env.example` 创建并打开它；如果仍包含示例占位值，也会停止启动并打开配置文件。需要填写：

- `DATA_ENCRYPTION_KEY`：长期保管的随机密钥。
- `ADMIN_INITIAL_PASSWORD`：仅首次创建管理员时使用，至少 6 位；部署时建议填写更长且唯一的密码，已有管理员后可移除。
- 本机 HTTP 开发可保留两个 Cookie Secure 选项为 `auto`。
- `TRUST_PROXY=loopback`。

保存配置后再次双击：

```text
启动系统.cmd
```

它会检查环境、端口和已有进程，后台启动 PGlite、API 与 Web，等待健康检查通过后自动打开管理后台。运行日志保存到 `.local-data/service-manager`。

需要停止、重启、查看状态、打开页面或查看日志时，双击：

```text
系统服务管理.cmd
```

命令行仍可一条命令启动 PGlite、API 和 Web：

```powershell
corepack pnpm dev:local
```

默认地址：

```text
管理后台：http://localhost:5173/admin/dashboard
API 健康检查：http://localhost:3000/api
API 文档：http://localhost:3000/api/docs
PGlite：127.0.0.1:5432
```

## 3. 手动启动同机服务

需要排查单个进程时，可以在同一台开发机上手动启动三个服务。先启动数据库：

```powershell
corepack pnpm exec pglite-server --db=./.local-data/pglite --port=5432 --host=127.0.0.1 --extensions=pgcrypto --max-connections=20
```

另一个终端执行：

```powershell
corepack pnpm --filter @order-system/api prisma:generate
corepack pnpm --filter @order-system/api db:deploy
corepack pnpm dev
```

## 4. 常用命令

```powershell
# 生成 Prisma Client
corepack pnpm --filter @order-system/api prisma:generate

# 应用已有迁移
corepack pnpm --filter @order-system/api db:deploy

# 类型检查
corepack pnpm typecheck

# API 单元测试
corepack pnpm --filter @order-system/api exec jest --runInBand

# API 端到端测试
corepack pnpm --filter @order-system/api exec jest --config ./test/jest-e2e.json --runInBand

# 全部生产构建
corepack pnpm build

# 生产依赖审计
corepack pnpm audit --prod

# 格式化
corepack pnpm format
```

## 5. 数据与密钥

- `.local-data`、`.env`、日志、备份和上传目录不提交版本库。
- 更换数据库或恢复数据时必须继续使用原 `DATA_ENCRYPTION_KEY`，否则已有敏感账号和返利凭证不可解密。
- 修改 Prisma schema 后必须创建迁移，不允许只修改生成文件。
- 本机运行状态默认保存到 `.local-data/runtime-control.json`。

## 6. 开发验收

后端改动至少执行 API typecheck 和相关 Jest 测试；页面改动至少执行 Prettier、Web typecheck、Web build，并检查亮色、暗色和 360px 手机宽度。完整 UI 验收规则见 `docs/ui-guidelines.md`，正式环境见 `docs/deployment.md`。
