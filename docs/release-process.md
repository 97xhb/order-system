# 版本发布与在线更新

## 每次更新必须完成

1. 修改功能后同步更新根目录 `package.json` 的版本号。
2. 更新 `release.json`，版本号必须与 `package.json` 一致。
3. 在 `release.json.notes` 中写明本次更新内容。
4. 在 `CHANGELOG.md` 增加对应版本段落。
5. 构建并部署后，在系统设置 → 运行状态 → 在线更新中验证版本。

## 在线更新结构

- Web/API 容器不直接持有 Docker 权限。
- 独立 `updater` 容器持有 Docker Socket，只读取固定更新请求文件。
- 更新器只执行固定流程：备份数据库、下载固定 GitHub 分支、构建 `api web`、重启 `api web`。
- 更新日志写入项目 `backups/online-update-*.log`。
- 更新失败不会删除数据库卷，也不会覆盖 `.env.docker`。

## 版本文件示例

```json
{
  "version": "1.0.1",
  "releasedAt": "2026-10-26",
  "title": "本次版本标题",
  "notes": ["更新说明一", "更新说明二"]
}
```
