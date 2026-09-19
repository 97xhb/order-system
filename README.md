# 下单登记与资金结算系统

[![Deploy with Docker Compose](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED?logo=docker&logoColor=white)](#一docker-compose-一键部署)
[![License](https://img.shields.io/badge/License-Private-lightgrey)](#八安全提醒)

面向下单、在线报单、寄件、收货佬回款、给下单人结算、利润统计和返利转换的一体化 Web 系统。

- 前端：Vue 3 + TypeScript + Vite + Element Plus + VXE Table
- 后端：NestJS + Prisma
- 数据库：PostgreSQL 16
- 部署：Docker Compose 单机三容器（Web / API / 数据库），一个命令即可启动和更新

---

## 一、Docker Compose 一键部署

### 1. 准备

宿主机只需要安装 Docker 和 Docker Compose，不需要安装 Node.js、pnpm、PostgreSQL。

```bash
docker --version
docker compose version
```

### 2. 获取项目

```bash
git clone https://github.com/97xhb/order-system.git
cd order-system
```

不用 Git 时，也可以在 GitHub 页面点击 `Code → Download ZIP`，解压后进入该目录。

### 3. 生成配置文件

```bash
cp .env.docker.example .env.docker
```

Windows PowerShell：

```powershell
Copy-Item .env.docker.example .env.docker
```

### 4. 修改必须填写的三项

打开 `.env.docker`，只改下面三项，其余保持默认即可：

| 配置项                   | 说明                                                     |
| ------------------------ | -------------------------------------------------------- |
| `POSTGRES_PASSWORD`      | 数据库密码，只用字母、数字、点、下划线或短横线           |
| `DATA_ENCRYPTION_KEY`    | 数据加密密钥，至少 32 位；用 `openssl rand -hex 32` 生成 |
| `ADMIN_INITIAL_PASSWORD` | 管理员首次登录密码，至少 6 位                            |

同时按实际访问方式填写：

```dotenv
WEB_ORIGIN=http://192.168.1.10:8191
INITIAL_ALLOWED_HOSTS=localhost
```

- 用 IP 访问：`WEB_ORIGIN` 填 `http://你的IP:8191`。
- 用域名访问：`WEB_ORIGIN` 填 `https://你的域名`，`INITIAL_ALLOWED_HOSTS` 填你的域名。
- 只允许本机访问：把 `WEB_BIND_ADDRESS` 改成 `127.0.0.1`。

> `.env.docker` 含真实密码和密钥，已经被 `.gitignore` 排除，不会提交到 GitHub。
> 以后更新代码不会覆盖这个文件，请自行备份保存。

### 5. 启动

```bash
docker compose --env-file .env.docker up -d --build
```

查看状态和日志：

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f --tail=200
```

等待 `db`、`api`、`web` 三个容器都显示 `running` 或 `healthy`。

### 6. 访问

```text
http://你的IP:8191/login
```

使用 `.env.docker` 中的 `ADMIN_USERNAME` 和 `ADMIN_INITIAL_PASSWORD` 登录。
全新安装默认不启用后台安全入口，登录后在「系统设置 → 面板配置」中自行设置。

---

## 二、后期源码更新后如何更新容器

数据库不会丢失，`.env.docker` 不会被覆盖。

### 方式 A：用 Git 部署（推荐）

```bash
cd order-system          # 进入项目目录
git pull                 # 拉取最新源码
sh scripts/update-docker.sh
```

### 方式 B：用 ZIP / 手动上传部署（飞牛 NAS 常见）

飞牛等环境通常是把项目文件拷进目录，没有 git 仓库，按下面做：

1. 从 GitHub 下载最新 ZIP 并解压。
2. 用新文件覆盖旧目录中的程序文件，但**不要删除、不要覆盖 `.env.docker`**。
3. 进入项目目录执行：

```bash
sh scripts/update-docker.sh
```

`update-docker.sh` 检测不到 git 时会跳过拉取，直接用当前目录重新构建。

### 或者手动执行等价命令

```bash
docker compose --env-file .env.docker up -d --build
```

说明：

- `.env.docker` 不会被覆盖，密码和密钥保持不变。
- 数据库迁移由 API 容器启动时自动执行，不需要手动操作。
- `postgres_data` 数据卷不会被删除，业务数据完整保留。
- 更新前建议先做一次备份：`docker compose --env-file .env.docker exec -T db pg_dump -U order_app -d order_system -Fc > order-backup.dump`

### 从旧版本（密码写在 compose 顶部）升级

如果你部署的是更早的版本，密码写在 `docker-compose.yml` 顶部，升级时不要直接覆盖。
先按 [飞牛 Compose 安装说明](飞牛Compose安装.txt) 的第八节把旧值搬进 `.env.docker`，
再启动，这样数据库卷和业务数据都会保留。

---

## 三、常用命令

```bash
# 查看状态
docker compose --env-file .env.docker ps

# 查看日志
docker compose --env-file .env.docker logs -f --tail=200

# 重启
docker compose --env-file .env.docker restart

# 停止并删除容器（保留数据库数据卷）
docker compose --env-file .env.docker down

# 只更新 web 和 api
docker compose --env-file .env.docker up -d --build api web
```

`docker compose down -v` 会删除数据卷，等于清空全部业务数据，谨慎使用。

---

## 四、数据保存在哪里

业务数据不在项目目录，而是保存在 Docker 卷中：

```bash
docker volume ls | grep order-system
docker volume inspect order-system_postgres_data --format '{{.Mountpoint}}'
```

主要数据卷：

| 数据卷                       | 内容                    |
| ---------------------------- | ----------------------- |
| `order-system_postgres_data` | PostgreSQL 全部业务数据 |
| `order-system_runtime_data`  | 运行状态与开关          |
| `order-system_caddy_data`    | Web 服务数据            |

只删除容器或镜像不会删除数据卷。保留旧数据时必须继续使用原来的
`POSTGRES_PASSWORD` 和 `DATA_ENCRYPTION_KEY`。

---

## 五、本机开发

安装 Node.js 24 后，双击根目录的 `启动系统.cmd`。停止、重启、看日志用
`系统服务管理.cmd`。命令行方式：

```powershell
corepack pnpm dev:local
```

开发地址：

- 管理后台：`http://localhost:5173/admin/dashboard`
- API 健康检查：`http://localhost:3000/api`
- API 文档：`http://localhost:3000/api/docs`

---

## 六、目录结构

```text
apps/api                 NestJS API、Prisma 与数据库迁移
apps/web                 Vue 3 管理后台和公开 H5 页面
packages/contracts       前后端共享类型
docker/                  Dockerfile、Caddy 配置、API 启动脚本
scripts/                 本机运行脚本、Docker 更新脚本
docs/                    产品、UI、部署、架构等专题文档
docker-compose.yml       唯一 Compose 文件
.env.docker.example      Docker 配置模板
启动系统.cmd              Windows 一键启动
系统服务管理.cmd          Windows 服务管理菜单
```

---

## 七、文档入口

- [当前项目上下文](PROJECT_CONTEXT.md)
- [完整部署教程（含飞牛 NAS）](docs/deployment.md)
- [飞牛 Compose 安装说明](飞牛Compose安装.txt)
- [产品需求](docs/requirements.md)
- [系统 UI 规范](docs/ui-guidelines.md)
- [系统架构](docs/architecture.md)
- [本机开发说明](docs/development.md)
- [安全检查记录](docs/security-audit.md)

---

## 八、安全提醒

- 不要把 `.env.docker` 提交到仓库、发给别人或截图分享。
- `DATA_ENCRYPTION_KEY` 产生数据后不能更换，否则已加密内容无法解密。
- 对外开放建议使用反向代理 + HTTPS，只暴露 80/443，不要直接暴露 8191、3000、5432。
- 首次登录后立即修改管理员密码，并按需设置后台安全入口和域名白名单。
