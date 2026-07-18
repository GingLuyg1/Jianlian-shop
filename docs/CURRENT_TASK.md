# 当前任务：协议版本管理修复待审查与正式验证

更新日期：2026-07-19
目标项目：Jianlian-shop / `qvbovrvybirscaurwuov`

## 正式审计结论

- 三张协议/证据表及基线字段、约束、索引和 RLS 已存在；缺表不是当前故障原因。
- 当前正式管理员同时满足 active `admin_users` 与 `profiles.role='admin'`；当前账号不满足旧 policy 的假设已排除，不创建 policy Migration。
- 正式库已存在 `purchase_notice / 2026.0718-01 / draft`。相同 `document_type/version` 的普通 insert 会触发 `23505`。
- 测试正文“1”仍不得发布；不得重放 `20260701` 或 `20260709` Migration。

## 本地代码已完成

- 新增 code-first 协议数据库错误分类：`23505`→409、`42501`→403、`42P01/PGRST205`→503、`42703/PGRST204`→结构不兼容；其他错误只返回安全通用提示。
- 删除按 message 中出现 `legal_documents`、schema cache 或普通表名就判断缺表的逻辑，并在协议查询 helper 中保留原始数据库错误对象和 code。
- `create_draft` 仍是普通 insert，不使用 upsert；页面增加同步提交锁、请求中禁用和 `23505` 后刷新/定位已有 draft。
- draft 增加编辑/取消编辑入口；编辑调用现有 `update_draft`，类型、版本和记录 ID 不允许从编辑表单修改，服务端再次约束 `status=draft`。
- 发布现在区分读取失败与不存在，并在旧 published 归档失败时停止；目标发布 update 再次约束 draft。归档会先读取并拒绝非 published 状态。
- 缓存刷新失败被安全吞吐并只记录 action、脱敏文档 ID、类型和版本，不会把已成功数据库操作响应改成失败。
- 错误日志只记录 action、数据库 code、约束名摘要、脱敏文档 ID、类型和版本，不记录正文、完整请求 body、请求元数据或用户敏感信息。
- 完整事务化发布尚未实现；当前两步更新仍可能在“旧版本已归档、新版本发布失败”时产生部分成功，必须作为后续独立 RPC/Migration 任务处理。

## 本地验证

- `npm test`：通过，134/134。
- `npm run typecheck`：通过。
- `npm run build`：通过；仅有仓库既有 Supabase dynamic dependency 和部分页面 CSR deopt 警告。

## 下一步

1. 审查本轮代码和文档差异；本轮未 commit、未 push。
2. 取得独立授权后再提交、推送和部署；部署前不得改变数据库或现有协议记录。
3. 部署后先用全新、非测试版本号验证创建，再验证编辑已有 draft；不得发布正文“1”的 `purchase_notice`。
4. 人工确认重复版本返回 HTTP 409 并自动定位已有 draft，权限/缺表/结构错误映射符合预期。
5. 发布功能的正式写验证需要独立授权；在事务化方案完成前必须保留部分成功风险提示和人工复核步骤。

## 当前禁止事项

- 不执行 SQL、RPC、Migration 或生产 API。
- 不创建、修改、发布或归档正式协议，不修改正式数据库或环境变量。
- 不部署、不 commit、不 push，不删除审计证据。
- 不把 `create_draft` 改成覆盖式 upsert。
