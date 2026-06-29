# 后台用户管理验收记录

## 用户列表结果

- `/admin/users` 已改为通过 `/api/admin/users` 读取真实数据库数据。
- 列表展示用户、邮箱、账户状态、当前余额、累计充值、累计消费、订单数量、注册时间、最后登录时间、风险状态和操作入口。
- 支持邮箱、昵称、用户 ID 搜索，支持账户状态、风险状态、注册时间范围筛选，并支持分页。
- 用户余额只读展示，列表不提供直接编辑入口。
- 单项统计读取失败时返回 `errors` 并在页面展示中文提示，不会导致整页白屏。

## 用户详情结果

- 用户详情抽屉通过 `/api/admin/users/[userId]` 按真实 `user_id` 查询。
- 已分区展示基本资料、账户状态、资产概览、最近订单、充值记录、余额流水、数字交付记录、站内通知占位、管理员操作记录、账户与风险历史。
- 不显示密码、Token、认证密钥、完整支付回调和完整数字库存原文。
- 各模块独立降级，部分表或字段未初始化时显示中文初始化提示。
- 查看敏感用户详情会写入 `admin_audit_logs` 审计记录。

## 账户状态管理

- 新增状态：`active`、`restricted`、`suspended`、`disabled`，中文分别为正常、受限、暂停、禁用。
- 状态修改只能由超级管理员 `gac000189@gmail.com` 通过 `/api/admin/users/[userId]/actions` 执行。
- 修改必须填写原因，并在前端二次确认。
- 禁用账号登录后会被立即退出并提示联系客服。
- 暂停账号会被服务端限制创建订单、创建充值和创建支付会话。
- 状态变更写入 `user_account_status_history` 和 `admin_audit_logs`。

## 风险标记结果

- 新增风险状态：`normal`、`watch`、`high_risk`、`blocked`，中文分别为正常、关注、高风险、拦截。
- 风险状态与账户状态分开保存。
- 修改必须填写风险原因，并保留追加记录到 `user_risk_records`。
- `blocked` 风险用户会被服务端限制创建订单、创建充值和创建支付会话。
- 风险记录只在后台展示，不向前台用户暴露内部风控备注。

## 余额人工调整

- 后台用户详情新增余额调整表单，支持增加余额、扣减余额、系统补偿、订单退款、错误入账修正和其他类型。
- 必须填写金额和原因，金额必须大于 0。
- 提交前展示当前余额和预计余额，并进行二次确认。
- 管理员不能直接编辑 `profiles.balance`，只能调用 `admin_adjust_user_balance` RPC。
- 调整成功后生成 `balance_transactions` 流水和 `balance_adjustment_requests` 记录。

## 余额调整原子性

- `admin_adjust_user_balance` RPC 在数据库内完成管理员校验、用户锁定、金额校验、余额更新、流水写入、调整请求写入。
- 使用 `client_request_id/request_id` 做幂等键，网络重试不会重复调整。
- 扣减余额时校验调整后余额不得小于 0。
- 并发调整通过锁定用户资料行避免覆盖。
- 审计日志由接口在 RPC 成功后写入，若审计写入失败，接口返回中文错误，避免静默成功。

## 业务限制检查

已接入服务端检查的入口：

- 创建订单：`/api/orders`。
- 创建充值：`/api/recharges`。
- 创建支付会话：`/api/payments/create`。
- 查看数字交付内容：`/api/orders/[orderNo]/delivery`。
- 修改账户资料：`/api/account/profile`。

规则：

- `disabled` 拒绝敏感业务操作，并在登录后主动退出。
- `suspended` 拒绝订单、充值和支付。
- `blocked` 拒绝订单、充值和支付。
- `restricted` 拒绝订单、充值、支付和资料修改。
- 已支付历史订单仍可按现有权限查看，交付内容仍要求登录和订单归属校验。

## 管理员审计日志

- 已记录：查看敏感用户详情、修改账户状态、修改风险状态、调整余额。
- 审计字段包括管理员、操作类型、目标用户、变更前后摘要、原因、时间、请求标识和结果。
- 不记录密码、Token、完整数字交付内容、支付密钥和完整回调原文。
- 普通用户无法访问后台用户接口或审计日志。

## 发现的问题

- 原后台用户页主要展示资料，缺少账户状态、风险状态、资产明细、余额人工调整和用户维度审计入口。
- 订单、充值、支付、交付和资料修改入口缺少统一账户状态/风险状态服务端校验。
- 普通前端个人资料页原先直接从浏览器更新 `profiles`，无法统一执行风控限制。

## 已修复的问题

- 增加后台用户列表、详情、账户状态、风险标记、余额调整和审计联动。
- 增加 `check_user_business_allowed` RPC 和 `lib/users/account-guard.ts` 统一业务限制检查。
- 将个人资料保存改为服务端 API。
- 登录流程增加禁用/拦截账号退出处理。
- 后台高风险操作改为 RPC + 审计日志路径。

## 仍存在的问题

- 需要手动执行 migration 后，数据库中的新增字段、RPC 和历史表才会生效。
- 禁用账号的登录拦截为应用层登录后退出；如需认证前彻底阻断，需要后续接 Supabase Auth Hook 或自定义认证策略。
- 审计日志写入在 RPC 成功后执行；如果未来要求审计与余额调整完全同事务，需要把审计写入下沉到数据库 RPC 或触发器。
- 站内通知模块本次仅保留后台占位，未开发通知系统。

## 需要执行的 migration

- `supabase/migrations/20260629_admin_user_controls.sql`

执行后建议在 Supabase SQL Editor 验证：

```sql
select account_status, risk_status from public.profiles limit 1;
select public.check_user_business_allowed(auth.uid(), 'create_order');
```

## 本地验证

- `tsc --noEmit`：通过。
- `npm run build`：待执行。
