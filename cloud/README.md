# Question Vault Cloud

题库知识库的推荐版本，支持账号隔离、跨设备同步、移动端访问、D1 持久化和 R2 图片存储。

## 开发

```powershell
Copy-Item .openai/hosting.example.json .openai/hosting.json
npm ci
npm run dev
```

要求 Node.js `>=22.13.0`。数据库结构位于 `db/schema.ts`，迁移文件位于 `drizzle/`。

真实 `.openai/hosting.json` 与环境变量属于部署私有配置，不应提交到公共仓库。

完整说明请参阅仓库根目录 [README.md](../README.md)。
