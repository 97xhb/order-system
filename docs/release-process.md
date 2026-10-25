# 版本发布与更新检查

## 每次更新必须完成

1. 修改功能后同步更新根目录 `package.json` 的版本号。
2. 更新 `release.json`，版本号必须与 `package.json` 一致。
3. 在 `release.json.notes` 中写明本次更新内容。
4. 在 `CHANGELOG.md` 增加对应版本段落。
5. 构建并部署后，在系统设置 → 运行状态 → 版本更新检查中验证版本。

## 更新检查

- Web/API 容器不直接持有 Docker 权限。
- 系统设置只读取 GitHub `release.json`，展示版本和更新说明。
- 应用内不执行服务器命令，实际更新仍由维护人员按部署文档执行。

## 版本文件示例

```json
{
  "version": "1.0.1",
  "releasedAt": "2026-10-26",
  "title": "本次版本标题",
  "notes": ["更新说明一", "更新说明二"]
}
```
