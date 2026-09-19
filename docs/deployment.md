# 单机 Docker Compose 保姆级部署教程

> 本文是项目唯一正式部署说明。正式环境固定使用一台机器运行 Web、API、PostgreSQL，不维护多台服务器拆分方案。

## 0. 新手应该按什么顺序看

第一次部署不要跳步骤，按下面顺序操作：

1. Windows 机器先看第 5 节；Ubuntu / Debian 机器先看第 6 节。
2. 飞牛图形部署直接按第 0.1 节；其他主机按第 7、8 节放置项目并创建 `.env.docker`。
3. 需要域名访问时完成第 9 节；只在本机测试可暂时跳过域名部分。
4. 按第 10 节构建和启动。
5. 按第 11、12 节完成第一次登录和验收。
6. 上线当天必须完成第 15、16 节的备份与恢复演练。
7. 日后更新只按第 18 节操作。

Docker 方案不要求宿主机单独安装 Node.js、pnpm、PostgreSQL、Caddy 或 Prisma；它们都在镜像和容器内运行。宿主机只需要 Docker、项目文件、域名和正确的端口配置。

## 0.1 飞牛 fnOS Docker 安装（图形界面最快方式）

飞牛 Docker 的 Compose 页面可以直接创建项目。本项目只有一个 Compose 文件 `docker-compose.yml`，密码、密钥和管理员账号统一放在同目录的 `.env.docker` 中；`.env.docker` 不进入版本库，所以以后更新源码不会覆盖你已经填好的配置。

飞牛 Compose 图形界面默认不会自动读取 `.env.docker`，因此第一次部署推荐按下面的 A 到 D 步骤用 SSH 命令完成，只需要复制一次配置文件即可。

### 图形界面操作

1. 在飞牛“文件管理”中创建长期目录，例如 `/vol1/1000/docker/order-system`。
2. 上传并解压项目部署包，确认 `docker-compose.yml`、`.env.docker.example`、`apps`、`packages`、`docker` 在同一层目录。
3. 复制 `.env.docker.example` 为 `.env.docker`，编辑 `.env.docker`。必须替换数据库密码、数据加密 Key 和管理员初始密码这三项 `CHANGE_ME` 示例值；管理员密码至少 6 位，加密 Key 至少 32 个字符。
4. 把 `WEB_ORIGIN` 填为 `http://NAS局域网IP:8191`；使用域名时，把实际域名同时写入 `INITIAL_ALLOWED_HOSTS`。
5. 打开“Docker → Compose → 新增项目”。
6. 项目名称填写 `order-system`。
7. 路径选择项目根目录，例如 `/vol1/1000/docker/order-system`。
8. 来源选择“上传 docker-compose.yml”，选择项目根目录中的 `docker-compose.yml`；如果界面提供“环境变量”或 env 文件入口，选择同目录的 `.env.docker`。
9. 勾选“创建项目后立即启动”，点击“确认”。
10. 等待镜像构建完成，确认 `db`、`api`、`web` 均为运行/健康状态。

首次构建需要下载基础镜像和安装依赖，可能需要几分钟。第一次登录使用 `.env.docker` 中填写的管理员账号和初始密码；全新安装默认不启用后台安全入口，可直接登录，进入后台后再到系统设置手动填写并保存。

Compose 文件把 Web 绑定到 `.env.docker` 中 `WEB_BIND_ADDRESS`（默认 `0.0.0.0`）的 `WEB_HOST_PORT`（默认 `8191`），因此同一局域网设备可以直接访问 `http://NAS_IP:8191`。域名反向代理的上游填写 NAS 局域网 IP 和 `8191`。API 的 `3000` 和 PostgreSQL 的 `5432` 仍不发布到宿主机。

如果保留旧数据库卷，数据库名称、账号、密码和数据加密 Key 必须继续使用旧值。如果需要完全重新开始，可以删除旧 Compose 项目、三个容器、旧镜像及 `order-system_postgres_data` 数据卷；删除数据卷会同时删除旧业务数据。

下面的 SSH 方式仍然保留，适合需要查看详细日志或批量维护的情况。

飞牛 NAS 推荐先通过局域网 `NAS_IP:8191` 完成验收，再配置域名和 HTTPS。填写后的 `.env.docker` 含密码和 Key，只保存在自己的 NAS，不要公开分享，也不要提交到 GitHub。

### A. 上传并解压

1. 在飞牛“文件管理”中创建一个长期保留的目录，例如 `docker/order-system`。
2. 上传 `order-system-fnos-*.zip`，在该目录中解压。
3. 解压后应直接看到 `docker-compose.yml`、`.env.docker.example`、`apps`、`packages`、`docker`、`scripts` 等内容。如果外面还套了一层目录，后续进入这一层执行命令即可。
4. 不要把项目放入下载缓存、回收站或会自动清理的临时目录。

### B. 打开 SSH 并进入项目目录

在飞牛系统设置中开启 SSH。Windows 打开 PowerShell，连接 NAS：

```powershell
ssh 你的飞牛用户名@NAS局域网IP
```

进入刚才解压的目录。不同存储空间的绝对路径可能不同，可在飞牛文件管理中查看路径；进入后执行 `pwd` 和 `ls`，确认当前目录存在 `docker-compose.yml`：

```bash
cd /实际路径/docker/order-system
pwd
ls
docker version
docker compose version
```

### C. 编辑飞牛部署配置

先生成配置文件，然后编辑里面的 `CHANGE_ME` 开头的三项。数据库账号密码可以自定义，管理员初始密码至少 6 位。`DATA_ENCRYPTION_KEY` 用于业务账号、接口凭证和备份加密，至少 32 个字符，开始产生数据后必须长期保留原值。

```bash
cp .env.docker.example .env.docker
chmod 600 .env.docker
vi .env.docker
```

也可以用 `sed` 直接替换三项（把引号里的内容换成自己的值）：

```bash
sed -i \
  -e 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=你的数据库密码|' \
  -e 's|^DATA_ENCRYPTION_KEY=.*|DATA_ENCRYPTION_KEY=你的至少32位密钥|' \
  -e 's|^ADMIN_INITIAL_PASSWORD=.*|ADMIN_INITIAL_PASSWORD=你的管理员密码|' \
  .env.docker
```

后台安全入口不在 Compose 中配置，也不会随机生成。全新安装可以直接访问 `/login` 或 `/admin`，登录后再到“系统设置 → 面板配置”手动设置。

### D. 构建并启动三个容器

```bash
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker build --pull
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker ps
```

第一次构建需要下载 Node.js、Caddy、PostgreSQL 和 pnpm 依赖，时间取决于 NAS 性能与网络。最终 `db`、`api`、`web` 都应显示 `healthy`。查看启动日志：

```bash
docker compose --env-file .env.docker logs --tail=200 db api web
```

局域网浏览器打开：

```text
http://NAS局域网IP:8191/admin
```

使用 `.env.docker` 中设置的管理员账号和初始密码直接登录。全新安装此时尚未启用后台安全入口；首次登录后立即修改密码，并在“系统设置 → 面板配置”中手动填写安全入口、检查域名白名单、外网访问规则和公开链接开关。保存入口后，后续外网访问必须使用该入口。

### E. 飞牛反向代理、域名和 HTTPS

本项目只需要把完整域名流量转发到 Web 端口，API 不单独反代。飞牛自带反向代理或 Nginx Proxy Manager 的目标填写：

```text
协议：http
目标主机：NAS局域网IP
目标端口：8191
```

如果反向代理直接运行在 NAS 宿主机上，目标也可以使用 `127.0.0.1:8191`；如果反向代理运行在另一个 Docker 容器内，不要填写该容器自己的 `127.0.0.1`，使用 NAS 局域网 IP 和 `8191`。

证书安装在飞牛反向代理或 Nginx Proxy Manager 上，Web/API/PostgreSQL 容器不需要挂载 SSL 证书。域名正式启用后，把 `.env.docker` 里的 `WEB_ORIGIN` 改成 `https://你的域名`，并把域名加入 `INITIAL_ALLOWED_HOSTS`，然后重新部署 API 和 Web：

```bash
docker compose --env-file .env.docker up -d --force-recreate api web
```

已有数据库不会再次应用 `INITIAL_ALLOWED_HOSTS`。还需要在后台“系统设置 → 面板配置/访问与安全”中加入同一域名。路由器只转发反向代理使用的 `80/443`，不要把 `8191`、`3000`、`5432` 直接转发到公网。

### F. 飞牛日常维护

```bash
# 状态
docker compose --env-file .env.docker ps

# 日志
docker compose --env-file .env.docker logs -f --tail=200

# 重启
docker compose --env-file .env.docker restart

# 停止并删除容器但保留数据库卷
docker compose --env-file .env.docker down

# 更新源码后重新构建并启动
docker compose --env-file .env.docker build --pull
docker compose --env-file .env.docker up -d
```

保留数据时不要执行 `docker compose --env-file .env.docker down -v`，该命令会删除 PostgreSQL 持久化卷。只有确认完全清空重装时才删除 `order-system_postgres_data`。正式录入数据前，按第 15、16 节完成一次数据库备份和恢复演练。

## 1. 部署完成后是什么样

部署完成后，同一台机器上会运行三个容器：

```text
手机 / 电脑浏览器
        │
        │ HTTPS 443 / HTTP 80
        ▼
宿主机外部反向代理
  ├─ 监听 80/443，负责域名、HTTPS 和证书
  └─ 转发到 127.0.0.1:8191
        │ HTTP
        ▼
Web 容器：Caddy（内部 :8190）
  ├─ 提供 Vue 静态页面
  └─ 把 /api 请求转发给 API 容器
        │
        ▼
API 容器：Node.js + NestJS
  ├─ 自动执行 Prisma 数据库迁移
  ├─ 提供后台和公开页面接口
  └─ 连接 PostgreSQL 容器
        │
        ▼
数据库容器：PostgreSQL 16
  └─ 数据保存在 Docker 持久化卷
```

Compose 只发布一个宿主机端口，绑定地址和端口都由 `.env.docker` 控制：

- `WEB_BIND_ADDRESS=0.0.0.0`（默认）允许局域网和反向代理容器访问，适合飞牛和局域网验收。
- `WEB_BIND_ADDRESS=127.0.0.1` 只允许宿主机本机访问，适合纯粹由本机反向代理转发的服务器。

公网的 TCP 80、TCP 443 和可选 UDP 443 由宿主机外部反向代理负责，不由本 Compose 的 Web 容器直接占用。以下端口不发布到公网：

- API 3000。
- PostgreSQL 5432。
- Web 上游 8191（只允许局域网或本机访问，不做路由器公网转发）。

每个容器日志最多保留 5 个 10 MB 文件，避免长期运行后日志无限增长占满磁盘。

### 1.1 容器内部端口和宿主机端口

这里需要区分“容器内部端口”和“宿主机端口”。Compose 的写法是：

```text
宿主机端口:容器内部端口
```

本项目当前端口关系如下：

| 服务       | 容器内部监听 | 宿主机映射                                             | 用途                                |
| ---------- | ------------ | ------------------------------------------------------ | ----------------------------------- |
| Web/Caddy  | 8190         | `${WEB_BIND_ADDRESS}:${WEB_HOST_PORT}:8190`，默认 8191 | 局域网验收或外部反向代理上游使用    |
| API/NestJS | 3000         | 不发布到宿主机                                         | Web 容器通过 `http://api:3000` 访问 |
| PostgreSQL | 5432         | 不发布到宿主机                                         | API 容器通过 `db:5432` 访问         |

因此，Web 容器内部固定监听 `8190`，宿主机使用 `8191` 作为反向代理上游。外部用户访问的是反向代理的 80/443，不直接访问 8191。

API 的 `3000` 目前只是 API 容器内部端口，`expose: 3000` 不等同于向宿主机发布端口。宿主机上即使有其他程序占用 3000，也不会和本 Compose 配置冲突；同样，其他 Compose 项目的容器也可以使用自己的内部 3000。

只有以下情况会产生端口冲突：

- 两个服务尝试绑定同一个宿主机端口，例如都发布 `8191:8190`。
- 同一个容器内的两个进程同时监听同一个 IP 和端口。
- 其他程序已经占用宿主机的 `127.0.0.1:8191`，导致 Web 容器无法启动；宿主机 80/443 则由外部反向代理负责。

容器之间连接时不要使用 `localhost`：

```text
Web → http://api:3000
API → db:5432
```

如果确实需要从宿主机或其他非 Compose 程序访问 API，可以额外增加例如 `127.0.0.1:3001:3000`，这表示“宿主机 3001 → API 容器 3000”；Caddy 和容器内部连接仍然继续使用 `api:3000`。默认不发布 API 端口，能减少公网暴露面。

如果宿主机的 8191 已被其他软件占用：修改 `.env.docker` 中的 `WEB_HOST_PORT`，例如改成 `8192`。容器内部端口仍保持 8190，外部反向代理的 upstream 要同步修改。

## 2. 项目已经准备好的 Docker 文件

项目根目录现有：

```text
docker-compose.yml
.env.docker.example
.dockerignore
docker/
  api.Dockerfile
  api-entrypoint.sh
  web.Dockerfile
  Caddyfile
scripts/
  setup-fnos-env.sh
  update-docker.sh
  build-fnos-release.ps1
```

每个文件的作用：

| 文件                           | 作用                                             |
| ------------------------------ | ------------------------------------------------ |
| docker-compose.yml             | 唯一的 Compose 文件，定义 db、api、web 三个容器  |
| .env.docker.example            | 配置模板，不包含真实密码；复制为 `.env.docker`   |
| docker/api.Dockerfile          | 构建 API 生产镜像                                |
| docker/api-entrypoint.sh       | 检查配置、等待数据库、执行迁移、启动 API         |
| docker/web.Dockerfile          | 构建 Vue 页面并放入 Caddy 镜像                   |
| docker/Caddyfile               | 在内部 8190 提供静态页面，并反向代理 `/api`      |
| .dockerignore                  | 阻止本机数据库、密钥、日志和开发产物进入镜像     |
| scripts/setup-fnos-env.sh      | 交互式生成 `.env.docker`，自动生成随机密钥       |
| scripts/update-docker.sh       | 拉取新代码并重新构建、重启容器，保留数据卷       |
| scripts/build-fnos-release.ps1 | 生成并校验不含密钥、本机数据和构建产物的飞牛 ZIP |

密码和密钥统一由 `.env.docker` 管理，`.env.docker` 不进版本库。Compose 只向宿主机发布 Web 端口，API 和数据库只在内部网络通信。

## 3. 先认识几个词

### 镜像

镜像相当于安装包。本项目会生成 Web 镜像和 API 镜像，PostgreSQL 使用官方镜像。

### 容器

容器是镜像运行后的实例。停止或重建容器不会自动删除持久化卷中的数据库。

### Docker Compose

Compose 读取 docker-compose.yml，一次管理 Web、API、数据库三个容器。

### 持久化卷

数据库和运行状态保存在 Docker 卷中。docker compose down 只停止并删除容器，卷会保留。docker compose down -v 会同时删除卷和数据库数据。

### Caddy

Caddy 运行在 Web 容器内部的 `8190` 端口，负责静态页面和 `/api` 到 API 容器的转发。正式域名、HTTPS 证书和 80/443 监听由宿主机外部反向代理负责；本项目 Compose 不再直接占用 80/443。

## 4. 部署前准备清单

至少准备：

- 一台 Windows 或 Linux 机器。
- 2 核 CPU。
- 4 GB 内存，推荐 8 GB。
- 40 GB 以上 SSD 可用空间。
- 管理员权限。
- 稳定公网 IP；只在局域网使用时可省略。
- 正式域名；仅本机测试时可省略。
- 路由器端口转发权限；云服务器直接配置安全组。
- 一套宿主机外部反向代理（Nginx、Caddy、Traefik 或云网关），把域名请求转发到 `127.0.0.1:8191`。

操作系统建议：

- 需要 24 小时长期运行：优先 Ubuntu 24.04 LTS 或当前受支持的 Debian 稳定版。
- 使用现有 Windows 电脑：使用 Docker Desktop，同样可以部署；要确保 Docker Desktop 开机启动，并避免电脑自动睡眠。

正式域名部署还需要：

- 域名 A 记录指向公网 IPv4。
- 使用 IPv6 时，AAAA 记录指向正确 IPv6。
- TCP 80 和 TCP 443 能从公网到达宿主机外部反向代理。
- 外部反向代理把业务请求转发到 `127.0.0.1:8191`。

不要把 3000、5432、8191 转发到公网；8191 只作为本机反向代理上游。

## 5. Windows 安装 Docker Desktop

### 5.1 开启虚拟化

打开任务管理器：

```text
任务管理器 → 性能 → CPU → 虚拟化
```

应显示“已启用”。如果显示未启用，需要在 BIOS 中开启 Intel VT-x、Intel Virtualization Technology 或 AMD-V/SVM。

### 5.2 安装或更新 WSL 2

以管理员身份打开 PowerShell：

```powershell
wsl --update
wsl --set-default-version 2
```

执行后重启 Windows。

### 5.3 安装 Docker Desktop

官方下载地址：

https://www.docker.com/products/docker-desktop/

安装时保留：

- Use WSL 2 instead of Hyper-V。
- Add shortcut to desktop。

启动 Docker Desktop，等待左下角显示 Docker Engine 正常运行。

进入 Docker Desktop 设置，开启随 Windows 登录自动启动 Docker Desktop。长期运行的电脑还要在 Windows 电源设置中关闭自动睡眠。

### 5.4 验证安装

打开新的 PowerShell：

```powershell
docker version
docker compose version
docker run --rm hello-world
```

三个命令都正常后继续。

### 5.5 Docker Desktop 资源

进入：

```text
Docker Desktop → Settings → Resources
```

建议：

- CPU：至少 2。
- Memory：至少 4 GB，推荐 6 GB。
- Disk image：确保有 40 GB 以上空间。

## 6. Ubuntu / Debian 安装 Docker

通过 SSH 登录服务器：

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

验证：

```bash
docker version
docker compose version
docker run --rm hello-world
```

如果使用 UFW：

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status
```

SSH 端口不是 22 时，把第一条换成实际端口。

## 7. 放置项目文件

### Windows 推荐目录

```text
D:\order-system
```

### Linux 推荐目录

```text
/opt/order-system
```

不要放在临时目录、下载缓存目录或会自动同步删除的网盘目录。

确认目录中至少存在：

```text
docker-compose.yml
package.json
pnpm-lock.yaml
apps
packages
docker
.env.docker.example
```

进入项目目录。

Windows：

```powershell
Set-Location D:\order-system
```

Linux：

```bash
cd /opt/order-system
```

## 8. 创建 Docker 环境变量

真实密码和密钥写入 .env.docker。这个文件已被项目忽略规则排除，不要发送给其他人，也不要提交到代码仓库。

先记住这三项的生命周期：

| 配置项                   | 什么时候填写                 | 后续是否可直接更换                                                       |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`      | **首次启动 PostgreSQL 之前** | 已有数据库时不能只改环境文件；需要在 PostgreSQL 内修改账号密码并同步配置 |
| `DATA_ENCRYPTION_KEY`    | **首次启动 API 之前**        | 产生加密数据后必须保持不变，并与备份一起长期保存                         |
| `ADMIN_INITIAL_PASSWORD` | **首次创建管理员之前**       | 只用于初始化；后续密码在后台修改并保存为数据库哈希                       |

`.env.docker.example` 已用“必须提前设置”“必须长期保存”“由管理员自行设置”标记这三项，复制后只替换对应占位值。

### 8.1 复制模板

Windows PowerShell：

```powershell
Copy-Item .env.docker.example .env.docker
notepad .env.docker
```

Linux：

```bash
cp .env.docker.example .env.docker
nano .env.docker
chmod 600 .env.docker
```

### 8.2 设置 PostgreSQL 密码（必须提前设置）

这是 PostgreSQL 容器第一次初始化时使用的数据库账号密码。必须在首次启动数据库前填写；数据库已经有数据后，修改 `.env.docker` 中这一项不会自动修改数据库内部密码。建议使用只含字母、数字、点、下划线或短横线的随机值。

Windows PowerShell：

```powershell
[Guid]::NewGuid().ToString("N")
```

Linux：

```bash
openssl rand -hex 24
```

把生成值填入：

```dotenv
POSTGRES_PASSWORD=生成的密码
```

### 8.3 设置数据加密密钥（必须提前设置并长期保存）

这个密钥用于支付宝账号、银行卡号、返利接口凭证和备份文件加密。必须在首次启动 API 前填写，并与数据库备份一起长期保管；产生加密数据后不要更换，否则旧数据无法解密。

Windows PowerShell：

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Linux：

```bash
openssl rand -hex 32
```

把生成值填入：

```dotenv
DATA_ENCRYPTION_KEY=生成的64位十六进制密钥
```

### 8.4 设置管理员密码（由你自行填写）

`ADMIN_INITIAL_PASSWORD` 由你直接填写，至少 6 个字符。它只在数据库第一次创建管理员时使用；首次成功创建后，修改或移除这个环境变量都不会修改数据库里的管理员密码，后续请在后台“修改密码”中更新。`scripts/setup-fnos-env.sh` 会交互式读取并确认这个值，不会在屏幕上显示。

密码可以使用字母、数字和符号；不要在值中加入换行。手动编辑 `.env.docker` 时，含空格或 `#` 等特殊字符的值请使用 Compose 支持的引号格式。

直接填写：

```dotenv
ADMIN_INITIAL_PASSWORD=你的初始管理员密码
```

首次登录后再在后台修改为自己长期使用的独立密码；生产环境建议使用明显长于 6 位的密码。

### 8.5 本机测试配置

第一次建议先用本机 HTTP 模式验证。

```dotenv
COMPOSE_PROJECT_NAME=order-system

WEB_BIND_ADDRESS=127.0.0.1
WEB_HOST_PORT=8191
WEB_ORIGIN=http://localhost:8191
INITIAL_ALLOWED_HOSTS=localhost

POSTGRES_DB=order_system
POSTGRES_USER=order_app
POSTGRES_PASSWORD=已经生成的数据库密码

API_PORT=3000
TRUST_PROXY=172.30.0.0/24

DATA_ENCRYPTION_KEY=已经生成的数据加密密钥

ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=管理员
ADMIN_INITIAL_PASSWORD=已经设置的管理员密码
ADMIN_SESSION_TTL_DAYS=30
ADMIN_SESSION_COOKIE=order_admin_session
ADMIN_ENTRY_TTL_DAYS=30
ADMIN_ENTRY_COOKIE=order_admin_entry
ADMIN_COOKIE_SECURE=auto

EXTERNAL_SESSION_TTL_DAYS=365
EXTERNAL_SESSION_COOKIE=order_external_session
EXTERNAL_COOKIE_SECURE=auto

LOCAL_RUNTIME_STATE_PATH=/var/lib/order-system/runtime-control.json
```

### 8.6 正式域名配置

假设同时使用 www.example.com 和 example.com：

```dotenv
COMPOSE_PROJECT_NAME=order-system

WEB_BIND_ADDRESS=127.0.0.1
WEB_HOST_PORT=8191
WEB_ORIGIN=https://www.example.com,https://example.com,http://localhost:8191
INITIAL_ALLOWED_HOSTS=www.example.com,example.com,localhost

POSTGRES_DB=order_system
POSTGRES_USER=order_app
POSTGRES_PASSWORD=已经生成的数据库密码

API_PORT=3000
TRUST_PROXY=172.30.0.0/24

DATA_ENCRYPTION_KEY=已经生成的数据加密密钥

ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=管理员
ADMIN_INITIAL_PASSWORD=已经设置的管理员密码
ADMIN_SESSION_TTL_DAYS=30
ADMIN_SESSION_COOKIE=order_admin_session
ADMIN_ENTRY_TTL_DAYS=30
ADMIN_ENTRY_COOKIE=order_admin_entry
ADMIN_COOKIE_SECURE=true

EXTERNAL_SESSION_TTL_DAYS=365
EXTERNAL_SESSION_COOKIE=order_external_session
EXTERNAL_COOKIE_SECURE=true

LOCAL_RUNTIME_STATE_PATH=/var/lib/order-system/runtime-control.json
```

字段说明：

| 字段                   | 填写方式                                         |
| ---------------------- | ------------------------------------------------ |
| WEB_BIND_ADDRESS       | 普通主机填 127.0.0.1；飞牛局域网验收填 0.0.0.0   |
| WEB_HOST_PORT          | Web 宿主机端口，默认 8191                        |
| WEB_ORIGIN             | 浏览器完整来源，包含协议；多个来源用英文逗号分隔 |
| INITIAL_ALLOWED_HOSTS  | 只在全新数据库第一次创建系统设置时生效           |
| POSTGRES_DB            | 建议保留 order_system                            |
| POSTGRES_USER          | 建议保留 order_app                               |
| POSTGRES_PASSWORD      | 使用生成的 URL 安全密码                          |
| TRUST_PROXY            | 必须和 docker-compose.yml 的 Docker 子网一致     |
| DATA_ENCRYPTION_KEY    | 长期密钥，恢复数据库时必须一起恢复               |
| ADMIN_INITIAL_PASSWORD | 只用于第一次创建管理员                           |
| ADMIN_COOKIE_SECURE    | HTTPS 填 true，本机 HTTP 填 auto                 |
| EXTERNAL_COOKIE_SECURE | HTTPS 填 true，本机 HTTP 填 auto                 |

API 启动脚本会根据 POSTGRES_USER、POSTGRES_PASSWORD 和 POSTGRES_DB 自动生成容器内部 DATABASE_URL。

## 9. 域名、DNS、路由器和云安全组

### 9.1 DNS

在域名服务商添加：

```text
记录类型：A
主机记录：www
记录值：你的公网 IPv4
TTL：默认
```

根域名也需要访问时，再添加：

```text
记录类型：A
主机记录：@
记录值：你的公网 IPv4
```

只配置一个域名时，`WEB_ORIGIN` 和 `INITIAL_ALLOWED_HOSTS` 都只保留实际使用的来源和域名。配置多个域名时，两个字段必须同步包含所有实际访问域名，否则可能出现页面能打开但 API 被白名单或 CORS 拒绝的情况。域名本身由外部反向代理接收，再转发到 `127.0.0.1:8191`。

公网 IPv6 未正确配置时，删除错误的 AAAA 记录，避免部分手机优先走错误 IPv6。

证书由宿主机外部反向代理申请和续期。使用 Cloudflare 时，第一次签发证书可先设为 DNS only，也就是关闭橙色代理云。

### 9.2 路由器端口转发

假设 Docker 主机局域网 IP 是 192.168.31.100：

| 外部端口 | 内部 IP        | 内部端口 | 协议      |
| -------- | -------------- | -------- | --------- |
| 80       | 192.168.31.100 | 80       | TCP       |
| 443      | 192.168.31.100 | 443      | TCP       |
| 443      | 192.168.31.100 | 443      | UDP，可选 |

建议在路由器 DHCP 中给部署机器绑定固定局域网 IP。

路由器只需要把 80/443 转发到宿主机上的外部反向代理。反向代理再转发到：

```text
http://127.0.0.1:8191
```

如果外部反向代理本身也是 Docker 容器，不要使用宿主机的 `127.0.0.1`，应让它与 Web 容器加入同一 Docker 网络，并把 upstream 写成 `http://web:8190`。

### 9.3 云服务器安全组

允许：

- TCP 80。
- TCP 443。
- UDP 443，可选。
- SSH 或 RDP 管理端口，只允许自己的固定来源更好。

不要开放：

- TCP 3000。
- TCP 5432。
- TCP 8191。

### 9.4 Windows 防火墙

Docker Desktop 通常会处理端口放行。如果局域网或公网仍然访问不到，以管理员身份打开 PowerShell：

```powershell
New-NetFirewallRule -DisplayName "Order System HTTP 80" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80
New-NetFirewallRule -DisplayName "Order System HTTPS 443" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443
New-NetFirewallRule -DisplayName "Order System HTTP3 443" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 443
```

查看规则：

```powershell
Get-NetFirewallRule -DisplayName "Order System*" |
  Select-Object DisplayName,Enabled,Direction,Action
```

### 9.5 检查端口占用

Windows：

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -In 80,443,8191 |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Linux：

```bash
sudo ss -lntup | grep -E ':(80|443|8191)\b'
```

如果 IIS、Nginx、Apache 或其他软件已经占用 80/443，先停止旧服务。

### 9.6 判断是否是真公网 IP

Windows 查询当前公网出口 IP：

```powershell
Invoke-RestMethod https://api.ipify.org
```

Linux：

```bash
curl -4 https://api.ipify.org
```

再登录路由器查看 WAN IP。WAN IP 与查询结果一致，通常才是可直接端口转发的公网 IPv4。WAN IP 如果属于下面范围，通常处于运营商 NAT 后面：

- 10.0.0.0/8。
- 100.64.0.0/10。
- 172.16.0.0/12。
- 192.168.0.0/16。

运营商 NAT 下仅配置路由器端口转发通常不会生效，需要向运营商申请公网 IP，或者改用受控的公网反向代理/隧道方案。

部分路由器不支持 NAT 回环，导致同一局域网内用公网域名访问失败，但手机流量可以正常访问。正式验收必须关闭手机 Wi-Fi，用移动网络测试一次。

## 10. 第一次构建与启动

以下命令都在项目根目录执行。

### 10.1 检查 Compose 配置

```powershell
docker compose --env-file .env.docker config --quiet
```

没有输出并返回命令提示符，表示 YAML 和环境变量格式正常。

### 10.2 拉取基础镜像并构建

```powershell
docker compose --env-file .env.docker build --pull
```

第一次会下载 Node.js、Caddy、PostgreSQL 和项目依赖，通常需要几分钟到几十分钟。后续构建会使用缓存。

### 10.3 启动全部服务

```powershell
docker compose --env-file .env.docker up -d
```

启动顺序：

1. PostgreSQL 容器启动。
2. PostgreSQL 健康检查通过。
3. API 容器启动。
4. API 自动执行 Prisma migrate deploy。
5. API 启动并通过健康检查。
6. Web 容器启动。
7. Caddy 提供页面并代理 /api。

### 10.4 查看状态

```powershell
docker compose --env-file .env.docker ps
```

正常时：

- db：Up、healthy。
- api：Up、healthy。
- web：Up、healthy。

### 10.5 查看首次启动日志

```powershell
docker compose --env-file .env.docker logs -f db api web
```

看到 API 健康启动后按 Ctrl+C 退出日志，不会停止容器。

只看最近 100 行：

```powershell
docker compose --env-file .env.docker logs --tail=100 api
docker compose --env-file .env.docker logs --tail=100 web
docker compose --env-file .env.docker logs --tail=100 db
```

## 11. 第一次访问和后台初始化

### 11.1 部署机器本地访问

Docker Web 上游只绑定本机：

```text
http://localhost:8191
```

这个端口只监听 127.0.0.1，不对局域网和公网开放。

登录页：

```text
http://localhost:8191/login
```

使用 .env.docker 中的 ADMIN_USERNAME 和 ADMIN_INITIAL_PASSWORD 登录。

### 11.2 远程 Linux 服务器初始化

在自己的电脑建立 SSH 隧道：

```bash
ssh -L 8191:127.0.0.1:8191 服务器用户@服务器IP
```

保持 SSH 窗口开启，然后在自己电脑浏览器打开：

```text
http://localhost:8191/login
```

### 11.3 后台首次配置

登录后进入系统设置：

1. 修改系统名称和品牌文字。
2. 确认允许外网访问。
3. 检查域名白名单。
4. 手动设置 5 至 12 位字母数字后台安全入口；全新安装不会随机生成。
5. 保存域名首页规则。
6. 修改管理员密码。
7. 记录后台安全入口。

需要物流查询时，再进入“系统设置 → 功能扩展 → ApiZero 快递物流查询”，填写 ApiZero API Key、启用功能并保存。API Key 可留空使用匿名额度，填写后使用 ApiZero 账户额度；Key 只在 API 内加密保存，不写入 Web 镜像、普通日志或 PostgreSQL 明文配置。连接测试支持可选承运商编码和手机号后四位；该功能不新增容器、不改变 Web/API/数据库三容器结构。

启用安全入口后的正式外网访问顺序：

```text
https://你的域名/后台安全入口
```

通过入口验证后再进入后台。

公开链接继续使用：

```text
https://你的域名/form/Token
https://你的域名/payout/Token
https://你的域名/order-query/Token
```

## 12. 验证部署结果

### 12.1 API 健康检查

本机：

```powershell
Invoke-RestMethod http://localhost:8191/api
```

正式域名：

```powershell
Invoke-RestMethod https://www.example.com/api
```

应返回类似：

```json
{
  "status": "ok",
  "service": "order-system-api",
  "timestamp": "..."
}
```

### 12.2 公开设置

```powershell
Invoke-RestMethod http://localhost:8191/api/system/public-settings
```

### 12.3 容器内部检查

```powershell
docker compose --env-file .env.docker exec api node -e "fetch('http://127.0.0.1:3000/api').then(r => r.text()).then(console.log)"
```

数据库：

```powershell
docker compose --env-file .env.docker exec db pg_isready -U order_app -d order_system
```

## 13. 日常管理命令

### 查看状态

```powershell
docker compose --env-file .env.docker ps
```

### 查看日志

```powershell
docker compose --env-file .env.docker logs -f
```

### 停止但保留容器

```powershell
docker compose --env-file .env.docker stop
```

### 启动已存在容器

```powershell
docker compose --env-file .env.docker start
```

### 重启全部服务

```powershell
docker compose --env-file .env.docker restart
```

### 只重启 API

```powershell
docker compose --env-file .env.docker restart api
```

### 只重启 Web

```powershell
docker compose --env-file .env.docker restart web
```

### 只重启数据库

```powershell
docker compose --env-file .env.docker restart db
```

### 删除容器但保留数据

```powershell
docker compose --env-file .env.docker down
```

再次启动：

```powershell
docker compose --env-file .env.docker up -d
```

### 验证电脑重启后自动恢复

三个服务都使用 `restart: unless-stopped`。Docker 服务正常自启动时，电脑重启后容器会自动恢复。

完成首次部署和备份后，可以安排一次维护窗口重启机器。重新登录后执行：

```powershell
docker compose --env-file .env.docker ps
```

确认 db、api、web 都重新达到 healthy。Windows 还要确认 Docker Desktop 已启动；Linux 可执行：

```bash
sudo systemctl is-enabled docker
sudo systemctl status docker --no-pager
```

### 查看和清理 Docker 磁盘

查看占用：

```powershell
docker system df
```

只清理已经不再使用的旧镜像：

```powershell
docker image prune -f
```

不要使用带 `--volumes` 的清理命令，也不要随意执行 `docker volume prune`，数据库正式数据就在 Docker 卷中。

## 14. 数据保存在哪里

Compose 使用以下卷：

| 卷                         | 内容                         |
| -------------------------- | ---------------------------- |
| order-system_postgres_data | PostgreSQL 正式业务数据      |
| order-system_runtime_data  | 数据库业务访问开关等运行状态 |
| order-system_caddy_data    | Web 容器 Caddy 数据          |
| order-system_caddy_config  | Caddy 运行配置               |

表中是默认 `COMPOSE_PROJECT_NAME=order-system` 对应的卷名；修改项目名称后，Docker 会使用新的项目前缀。

查看卷：

```powershell
docker volume ls
docker volume inspect order-system_postgres_data
```

普通的 docker compose down 会保留这些卷。

以下命令会删除数据库卷和全部正式数据：

```powershell
docker compose --env-file .env.docker down -v
```

只在确认要彻底重建空系统，并且已经完成备份时使用。

## 15. PostgreSQL 备份

下面命令按模板默认值 `POSTGRES_USER=order_app`、`POSTGRES_DB=order_system` 编写。如果你修改过这两个字段，命令中的用户名和数据库名也要同步替换。

### 15.1 Windows PowerShell 备份

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
cmd /c "docker compose --env-file .env.docker exec -T db pg_dump -U order_app -d order_system -Fc > backups\order-system-$stamp.dump"
Get-Item "backups\order-system-$stamp.dump"
```

备份文件大小应大于 0。

### 15.2 Linux 备份

```bash
mkdir -p backups
docker compose --env-file .env.docker exec -T db \
  pg_dump -U order_app -d order_system -Fc \
  > backups/order-system-$(date +%Y%m%d-%H%M%S).dump
ls -lh backups
```

### 15.3 同时备份密钥

数据库备份之外，还要单独加密保存：

- .env.docker。
- 当前项目版本。
- docker-compose.yml。
- docker 目录。
- 上传或附件目录，后续启用文件上传后必须加入。

DATA_ENCRYPTION_KEY 丢失后，数据库中的敏感加密资料不会恢复为可读内容。

### 15.4 系统内置完整与分类备份（推荐日常使用）

部署完成后登录后台，进入“系统设置 → 功能扩展 → 数据备份与恢复”：

1. 默认选择“全部数据”；也可多选订单列表、下单人与回款、平台与在线报单、接口配置、返利历史、系统与管理员、操作日志，再点击“导出所选备份”。
2. 文件使用 `DATA_ENCRYPTION_KEY` 加密并 gzip 压缩。订单等分类会自动携带外键恢复所需的引用数据；接口配置包含已经加密保存的 ApiZero 和返利凭证。
3. 需要恢复时选择文件，先点击“选择并校验备份”；校验通过后点击“恢复数据”，输入当前管理员密码和确认词 `RESTORE`。
4. 完整恢复在事务内替换全部业务数据，并撤销管理员和公开身份会话；选择性恢复按主键合并/覆盖所选主数据，只补齐依赖引用，不清空其他模块。跨系统整体迁移应使用完整备份。

`.osbackup` 不是 PostgreSQL 原生 dump，必须在同一套 `DATA_ENCRYPTION_KEY` 下由本系统恢复；当前版本继续兼容 V1 完整备份。建议同时保留一份第 15 节的 `pg_dump`，用于容器级灾难恢复；两种备份都不要放在公开 Web 目录。

## 16. 备份恢复演练

先恢复到测试数据库，确认备份有效。

### 16.1 创建测试数据库

```powershell
docker compose --env-file .env.docker exec db createdb -U order_app order_system_restore
```

### 16.2 Windows 导入测试数据库

把文件名换成实际备份：

```powershell
cmd /c "type backups\order-system-YYYYMMDD-HHMMSS.dump | docker compose --env-file .env.docker exec -T db pg_restore --no-owner -U order_app -d order_system_restore"
```

### 16.3 Linux 导入测试数据库

```bash
docker compose --env-file .env.docker exec -T db \
  pg_restore --no-owner -U order_app -d order_system_restore \
  < backups/order-system-YYYYMMDD-HHMMSS.dump
```

### 16.4 检查测试数据库

```powershell
docker compose --env-file .env.docker exec db psql -U order_app -d order_system_restore -c "\dt"
docker compose --env-file .env.docker exec db psql -U order_app -d order_system_restore -c "select count(*) from orders;"
```

演练完成后删除测试数据库：

```powershell
docker compose --env-file .env.docker exec db dropdb -U order_app order_system_restore
```

## 17. 正式恢复数据库

正式恢复前先停止 Web 和 API，避免继续写入。

```powershell
docker compose --env-file .env.docker stop web api
docker compose --env-file .env.docker up -d db
```

Windows：

```powershell
cmd /c "type backups\order-system-YYYYMMDD-HHMMSS.dump | docker compose --env-file .env.docker exec -T db pg_restore --clean --if-exists --no-owner -U order_app -d order_system"
```

Linux：

```bash
docker compose --env-file .env.docker exec -T db \
  pg_restore --clean --if-exists --no-owner \
  -U order_app -d order_system \
  < backups/order-system-YYYYMMDD-HHMMSS.dump
```

恢复后启动：

```powershell
docker compose --env-file .env.docker up -d api web
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 api
```

## 18. 更新项目

每次更新都按以下顺序。

### 18.1 更新前备份

先完成数据库备份和 .env.docker 备份。

### 18.2 放入新代码

使用 Git 部署时直接拉取：

```bash
git pull
```

手动上传新代码时，不要覆盖：

- .env.docker。
- backups。
- 自己保存的附件目录。

### 18.3 检查配置

```powershell
docker compose --env-file .env.docker config --quiet
```

### 18.4 构建新镜像

```powershell
docker compose --env-file .env.docker build --pull
```

### 18.5 启动新版本

```powershell
docker compose --env-file .env.docker up -d
```

API 容器启动时会自动执行尚未应用的 Prisma 迁移（包括设备指纹、物流配置表和 ApiZero 适配迁移），因此升级到本版本不需要手动进入数据库执行 SQL。原物流接口密钥不会作为 ApiZero Key 沿用，升级后需要在系统设置中重新保存 ApiZero API Key 并启用物流查询。

### 18.6 验证

```powershell
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=200 api
Invoke-RestMethod http://localhost:8191/api
```

然后测试：

- 管理员登录。
- 订单列表。
- 新建和编辑订单。
- 在线报单。
- 回款登记。
- 订单查询。
- 返利转换。

## 19. 回滚

程序回滚需要保留上一版本项目目录或压缩包。

推荐目录：

```text
D:\order-system-releases\2026-08-18
D:\order-system-releases\2026-08-19
```

回滚步骤：

1. 停止当前 Web 和 API。
2. 恢复上一版本代码。
3. 使用原 .env.docker。
4. 重新构建。
5. 启动并检查日志。

```powershell
docker compose --env-file .env.docker stop web api
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d
```

如果新版本数据库迁移与旧程序不兼容，使用升级前数据库备份恢复。

## 20. 把整套系统迁移到另一台机器

准备：

- 完整项目目录或相同版本代码。
- .env.docker。
- PostgreSQL dump 备份。
- 上传和附件备份。

新机器步骤：

1. 安装 Docker。
2. 放置项目文件。
3. 恢复原 .env.docker。
4. 执行 docker compose build。
5. 先启动 db。
6. 恢复数据库备份。
7. 启动 api 和 web。
8. 修改 DNS 指向新公网 IP。
9. 恢复外部反向代理配置，确认 upstream 指向 `127.0.0.1:8191`，再检查 HTTPS 和公开链接。

HTTPS 证书由新机器上的外部反向代理重新申请或恢复。Web 容器的 `caddy_data` 只保存内部运行数据，不再承担公网证书；数据库和 DATA_ENCRYPTION_KEY 更关键。

## 21. 本机 PGlite 数据说明

当前开发数据位于 .local-data/pglite。Docker 正式数据库使用 PostgreSQL 卷，启动 Compose 不会自动把 PGlite 数据复制到 PostgreSQL。

不要把 .local-data/pglite 直接复制到 PostgreSQL 卷。

需要迁移现有本机数据时，应使用专门的数据导出、字段校验和导入流程，确认迁移成功后再正式切换。

## 22. HTTPS 与外部反向代理工作原理

1. Web 容器在内部端口 8190 提供页面和 `/api` 同源代理。
2. Compose 把宿主机 `127.0.0.1:8191` 转发到 Web 容器 8190。
3. 宿主机外部反向代理监听公网 80/443，并负责域名和 HTTPS 证书。
4. 外部反向代理把请求转发到 `http://127.0.0.1:8191`。
5. Web 容器收到 `/api` 请求后，再转发到容器网络的 `http://api:3000`。
6. 外部反向代理负责证书续期，Web 容器不直接接收公网流量。

HTTPS 成功条件：

- DNS 已生效。
- 80 和 443 从公网可达。
- 域名没有解析到错误 IP。
- 路由器转发正确。
- 云安全组允许 80/443。
- 外部反向代理正常监听 80/443。
- 外部反向代理能访问 `127.0.0.1:8191`。

### 22.1 使用已经申请好的 SSL 证书

如果证书已经在其他平台申请完成，证书应安装到监听公网 443 的外部反向代理上，不需要复制到项目的 Web、API 或数据库容器中。项目 Web 容器继续使用内部 HTTP `8190`，宿主机上游入口仍是 `127.0.0.1:8191`。

证书通常需要两个文件：

- `fullchain.pem`：站点证书加中间证书链。
- `privkey.pem`：证书私钥。私钥不要提交到 Git，也不要放到公开 Web 目录。

如果证书供应商只提供 `.crt` 和 `.key`，可以把 `.crt` 作为 `fullchain.pem` 使用；如果同时提供 CA 中间证书，应先把站点证书和中间证书按顺序合并成完整链。Windows IIS 通常使用包含私钥的 `.pfx` 文件。

#### 方案 A：宿主机 Nginx 终止 HTTPS

将证书放到宿主机的受保护目录，例如 Linux 的 `/etc/nginx/ssl/order-system/`，然后创建站点配置：

```nginx
server {
    listen 80;
    server_name www.example.com example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.example.com example.com;

    ssl_certificate     /etc/nginx/ssl/order-system/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/order-system/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8191;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

检查并加载配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Windows 使用 Nginx 时，把证书路径改成 Windows 路径，例如 `D:/nginx/ssl/order-system/fullchain.pem`，然后执行 `nginx -t` 和 `nginx -s reload`。

#### 方案 B：宿主机 Caddy 使用已有证书

如果宿主机已经运行 Caddy，可以在宿主机 Caddyfile 中配置：

```caddyfile
www.example.com, example.com {
    tls /etc/caddy/ssl/order-system/fullchain.pem /etc/caddy/ssl/order-system/privkey.pem
    reverse_proxy 127.0.0.1:8191
}
```

检查并加载配置：

```bash
caddy validate --config /etc/caddy/Caddyfile
caddy reload --config /etc/caddy/Caddyfile
```

宿主机 Caddy 监听 80/443，项目 Compose 中的 Web 容器仍只绑定 `127.0.0.1:8191`，不要再让项目 Web 容器发布 80/443，否则会和宿主机反向代理端口冲突。

#### 方案 B-1：Windows 宿主机配置 Caddy

1. 从 Caddy 官网下载 Windows 版本的 `caddy.exe`，例如放到：

```text
C:\Caddy\caddy.exe
```

2. 创建配置和证书目录：

```powershell
New-Item -ItemType Directory -Force C:\Caddy\certs | Out-Null
New-Item -ItemType Directory -Force C:\Caddy\logs | Out-Null
```

将已有证书复制为：

```text
C:\Caddy\certs\fullchain.pem
C:\Caddy\certs\privkey.pem
```

3. 创建 `C:\Caddy\Caddyfile`。把 `www.example.com` 和 `example.com` 换成你的真实域名：

```caddyfile
http://www.example.com, http://example.com {
    redir https://{host}{uri} permanent
}

https://www.example.com, https://example.com {
    tls C:/Caddy/certs/fullchain.pem C:/Caddy/certs/privkey.pem
    reverse_proxy 127.0.0.1:8191
}
```

第一段明确监听 HTTP 并跳转到 HTTPS；第二段监听 HTTPS，使用 `tls` 指定已有证书，再把请求转发到项目的 `127.0.0.1:8191`。使用已有证书时不需要关闭全局自动 HTTPS。

4. 以管理员身份打开 PowerShell，验证配置：

```powershell
Set-Location C:\Caddy
& .\caddy.exe validate --config C:\Caddy\Caddyfile
```

看到 `Valid configuration` 后，先以前台方式启动测试：

```powershell
& .\caddy.exe run --config C:\Caddy\Caddyfile
```

保持这个窗口运行，然后用浏览器打开 `https://你的域名`。确认页面、后台登录和 `/api` 都正常后，再按 `Ctrl+C` 停止测试进程。

5. 正式运行 Caddy：

```powershell
Start-Process -WindowStyle Hidden -FilePath C:\Caddy\caddy.exe -ArgumentList @(
    'run',
    '--config', 'C:\Caddy\Caddyfile',
    '--adapter', 'caddyfile'
)
```

如果希望 Windows 重启后自动运行，可以使用任务计划程序创建一个“开机时运行”的任务，程序填写 `C:\Caddy\caddy.exe`，参数填写：

```text
run --config C:\Caddy\Caddyfile --adapter caddyfile
```

任务使用“最高权限运行”，启动目录填写 `C:\Caddy`。不要重复启动多个 Caddy 进程，否则 80/443 会端口冲突。

6. 如果 Caddyfile 或证书更新，执行：

```powershell
& C:\Caddy\caddy.exe validate --config C:\Caddy\Caddyfile
& C:\Caddy\caddy.exe reload --config C:\Caddy\Caddyfile
```

如果当前 Caddy 是通过 `run` 前台启动的，直接停止后重新执行 `run` 也可以。

7. Windows 防火墙允许公网访问 80/443：

```powershell
New-NetFirewallRule -DisplayName "Order System HTTP" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80
New-NetFirewallRule -DisplayName "Order System HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443
```

路由器再把公网 TCP `80`、`443` 转发到这台 Windows 电脑。项目的 `8191` 不需要转发到公网。

如果你想让 Caddy 自动申请和续期证书，不使用已有证书时，把站点配置简化为：

```caddyfile
www.example.com, example.com {
    reverse_proxy 127.0.0.1:8191
}
```

此时必须保证域名 A/AAAA 记录指向当前公网 IP，并且公网 `80/443` 能访问到这台电脑；Caddy 会自动管理证书。

#### 环境变量与后台白名单

编辑 `.env.docker`，把所有实际访问域名同步到 `WEB_ORIGIN` 和 `INITIAL_ALLOWED_HOSTS`：

```dotenv
WEB_ORIGIN=https://www.example.com,https://example.com,http://localhost:8191
INITIAL_ALLOWED_HOSTS=www.example.com,example.com,localhost
ADMIN_COOKIE_SECURE=true
EXTERNAL_COOKIE_SECURE=true
```

修改环境变量后重新创建 API 容器：

```bash
docker compose --env-file .env.docker up -d --force-recreate api web
```

如果数据库已经初始化，`INITIAL_ALLOWED_HOSTS` 不会覆盖已有白名单；登录后台进入“系统设置 → 面板配置/访问与安全”，把每个实际域名加入域名白名单。多个域名必须同时满足三处配置：证书的 SAN/通配范围、反向代理的 `server_name` 或站点地址、系统后台域名白名单。

#### 路由器与安全组

将公网 TCP `80`、`443` 转发到运行外部反向代理的机器。不要把 `8191`、`3000` 或 `5432` 转发到公网；它们分别是本机上游、API 内部端口和数据库端口。

#### 验证

```bash
curl -I http://www.example.com
curl -I https://www.example.com
curl -sS https://www.example.com/api/system/public-settings
```

预期结果：HTTP 自动跳转 HTTPS，HTTPS 返回 `200`，公开设置接口能够正常返回。浏览器访问后台时，Cookie 安全属性应使用 `Secure`；公开报单、回款登记和订单查询链接也应使用同一 HTTPS 域名。

## 23. 常见错误排查

### 23.1 docker 命令不存在

Windows：

- 确认 Docker Desktop 已安装并启动。
- 关闭旧 PowerShell，重新打开。
- 执行 docker version。

Linux：

- 执行 sudo systemctl status docker。
- 当前用户加入 docker 组后重新登录。

### 23.2 80 或 443 被占用

Windows：

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -In 80,443 |
  Select-Object LocalPort,OwningProcess
Get-Process -Id 进程ID
```

Linux：

```bash
sudo ss -lntup | grep -E ':(80|443)\b'
```

停止占用端口的 IIS、Nginx、Apache 或旧容器。

### 23.3 db 一直 unhealthy

```powershell
docker compose --env-file .env.docker logs --tail=200 db
```

检查：

- POSTGRES_PASSWORD 是否仍是示例值。
- 磁盘是否已满。
- PostgreSQL 卷权限是否正常。
- POSTGRES_USER 和 POSTGRES_DB 是否为空。

### 23.4 api 反复重启

```powershell
docker compose --env-file .env.docker logs --tail=300 api
```

常见原因：

- DATA_ENCRYPTION_KEY 仍是示例值。
- 首次创建管理员时 `ADMIN_INITIAL_PASSWORD` 少于 6 位或仍为示例值。
- POSTGRES_PASSWORD 含空格、冒号、@、# 等字符。
- 数据库迁移失败。
- Docker 内存不足。

### 23.5 web 正常但 API 请求失败

```powershell
docker compose --env-file .env.docker exec web wget -qO- http://api:3000/api
```

再检查：

- api 是否 healthy。
- Caddyfile 是否存在。
- WEB_ORIGIN 是否与浏览器地址一致。
- 域名是否在系统白名单。

### 23.6 浏览器提示域名不允许

检查 .env.docker：

```dotenv
INITIAL_ALLOWED_HOSTS=www.example.com,example.com,localhost
```

同时确认：

```dotenv
WEB_ORIGIN=https://www.example.com,https://example.com,http://localhost:8191
```

这个字段只对全新数据库第一次初始化生效。数据库已经创建后，在后台系统设置中修改域名白名单。

### 23.7 登录成功后又回登录页

正式 HTTPS 检查：

```dotenv
WEB_ORIGIN=https://www.example.com,http://localhost:8191
ADMIN_COOKIE_SECURE=true
EXTERNAL_COOKIE_SECURE=true
```

不要给 WEB_ORIGIN 末尾添加斜杠。

### 23.8 外部反向代理或 HTTPS 失败

检查：

- DNS A 记录指向正确公网 IP。
- AAAA 记录是否错误。
- 80/443 是否对公网开放。
- 外部反向代理的 upstream 是否为 `http://127.0.0.1:8191`。
- `Invoke-RestMethod http://localhost:8191/api` 是否正常。
- Cloudflare 是否暂时设为 DNS only。

Web 容器日志：

```powershell
docker compose --env-file .env.docker logs --tail=300 web
```

### 23.9 Docker 网络段冲突

项目默认网络：

```text
172.30.0.0/24
```

如果与现有 VPN 或 Docker 网络冲突，同时修改：

- docker-compose.yml 的 subnet。
- .env.docker 的 TRUST_PROXY。

两处必须保持一致。

修改后：

```powershell
docker compose --env-file .env.docker down
docker compose --env-file .env.docker up -d
```

### 23.10 修改数据库密码后 API 连不上

PostgreSQL 容器只在空数据卷第一次启动时使用 POSTGRES_PASSWORD 初始化账号。已有数据库卷不会因为修改 .env.docker 自动改密码。

已有系统修改密码时，需要先在 PostgreSQL 内执行 ALTER ROLE，再同步修改 .env.docker。

### 23.11 页面更新后仍显示旧内容

```powershell
docker compose --env-file .env.docker build --no-cache web
docker compose --env-file .env.docker up -d web
```

然后浏览器强制刷新。

### 23.12 查看最终 Caddy 配置

```powershell
docker compose --env-file .env.docker exec web caddy validate --config /etc/caddy/Caddyfile
docker compose --env-file .env.docker exec web caddy adapt --config /etc/caddy/Caddyfile --pretty
```

### 23.13 拉取镜像或安装依赖超时

常见表现包括 `i/o timeout`、`TLS handshake timeout`、`ECONNRESET` 或长时间停在下载层。

先分别测试：

```powershell
docker pull postgres:16-alpine
docker pull caddy:2-alpine
docker pull node:24-bookworm-slim
```

Windows 在 Docker Desktop 的代理设置中配置实际可用的 HTTP/HTTPS 代理；Linux 给 Docker daemon 配置代理后重启 Docker。不要把来源不明的镜像加速地址写进项目文件。代理恢复后重新执行：

```powershell
docker compose --env-file .env.docker build --pull
```

## 24. 安全检查清单

- [ ] .env.docker 已替换全部示例值。
- [ ] .env.docker 没有上传到代码仓库或网盘公开目录。
- [ ] DATA_ENCRYPTION_KEY 已单独加密备份。
- [ ] 管理员初始密码至少 6 位（生产环境建议更长）。
- [ ] 首次登录后已修改管理员密码。
- [ ] 只由外部反向代理开放 80/443 和必要的管理端口。
- [ ] 3000、5432、8191 未开放公网。
- [ ] 正式域名已使用 HTTPS。
- [ ] 已先直接登录后台，再按需要手动填写并保存后台安全入口。
- [ ] 域名白名单只包含实际使用域名。
- [ ] 已完成数据库备份。
- [ ] 已完成一次恢复演练。
- [ ] Docker 和基础镜像定期更新。
- [ ] 每次升级前先备份。

## 25. 最终上线验收

容器：

- [ ] db 为 healthy。
- [ ] api 为 healthy。
- [ ] web 为 healthy。

网络：

- [ ] http 自动跳转 https。
- [ ] HTTPS 证书有效。
- [ ] 手机流量可以访问域名。
- [ ] 3000 和 5432 从公网不可访问。

业务：

- [ ] 未设置安全入口时可直接登录；设置后可以通过该入口登录。
- [ ] 订单列表正常读取和写入。
- [ ] 在线报单链接正常提交。
- [ ] 回款登记链接正常提交。
- [ ] 订单查询链接正常查询。
- [ ] 返利转换接口正常。
- [ ] 操作日志正常记录。

数据：

- [ ] 数据库卷存在。
- [ ] 重启容器后数据仍存在。
- [ ] 已生成首次 dump 备份。
- [ ] .env.docker 和 DATA_ENCRYPTION_KEY 已安全备份。

## 26. 最常用的六条命令

启动：

```powershell
docker compose --env-file .env.docker up -d
```

查看状态：

```powershell
docker compose --env-file .env.docker ps
```

查看日志：

```powershell
docker compose --env-file .env.docker logs -f
```

重启：

```powershell
docker compose --env-file .env.docker restart
```

更新构建：

```powershell
docker compose --env-file .env.docker build --pull
docker compose --env-file .env.docker up -d
```

停止并删除容器、保留数据：

```powershell
docker compose --env-file .env.docker down
```
