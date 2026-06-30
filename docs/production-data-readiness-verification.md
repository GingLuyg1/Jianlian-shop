# 生产数据封板验收报告

## 疑似测试数据清单

已新增只读扫描规则，按表分组识别以下类型：

- 测试用户：`profiles.email/display_name/full_name`
- 测试分类：`categories.name/slug/description`
- 测试商品：`products.name/slug/short_description/description`
- 测试 SKU：`product_skus.sku_code/title`
- 测试订单：`orders.order_no/customer_email/customer_name/customer_note/admin_note`
- 测试支付：`payment_sessions.payment_no/provider/channel_code/provider_order_no/provider_transaction_id`
- 测试充值：`account_recharges.recharge_no/payment_channel/provider_transaction_id`
- 测试退款：`refund_requests.refund_no/reason/admin_note`
- 测试余额流水：`balance_transactions.business_no/description`
- 测试库存：`digital_inventory.batch_no/remark`，不扫描库存明文
- 测试交付：`order_deliveries.delivery_note/failure_reason`，不扫描交付明文
- 测试访问统计、审计日志和错误日志

关键词：`test/demo/mock/sandbox/example/sample/dev/local/localhost/fake/placeholder`。

## 需人工确认数据

所有命中规则的数据都只标记为疑似，不能自动删除。以下记录必须人工确认：

- 任何订单、支付、充值、退款和余额流水。
- 任何已预留、已交付或已查看的数字库存与交付记录。
- 任何管理员审计日志和系统错误日志。
- 任何包含 `sandbox` 但可能来自真实 Provider 沙箱验收的数据。

## 硬编码占位数据

检查结果：

- Provider 未配置时仍返回未配置错误，不生成假支付成功。
- 空状态文案保留，不视为演示数据。
- 未发现新增真实二维码、真实钱包地址或真实密钥。
- 后台生产 readiness 页面会提示继续人工检查固定统计数字、测试密钥和占位协议。

## 环境来源标识

新增兼容 migration：

- `supabase/migrations/20260630_data_origin_labels.sql`

字段设计：

- `source_environment`
- `data_origin`
- `is_test`
- `provider_environment`

该 migration 不自动执行，不回填历史数据。

## dry-run 工具

新增：

- `scripts/production-data-cleanup-dry-run.sql`

该脚本只包含 `SELECT` 和统计，不包含删除、截断或表结构破坏操作。

## 清理脚本模板

新增：

- `scripts/production-data-cleanup-template.sql`

模板默认全部注释，要求：

- 必须先备份。
- 必须先执行 dry-run。
- 必须人工核对记录。
- 必须在正确环境执行。
- 必须逐段解除注释。

## 生产初始化配置

只读页面检查：

- 超级管理员状态。
- 站点配置状态。
- 支付配置状态。
- 商品与库存状态。
- 测试数据风险。
- 硬编码占位风险。

缺少配置只显示警告或阻塞，不自动创建账号、不写入弱密码、不覆盖真实配置。

## production readiness 页面

新增后台页面：

```text
/admin/system/production-readiness
```

新增 API：

```text
/api/admin/system/production-readiness
```

权限：

- 只允许管理员访问。
- 普通用户或未登录用户返回 401/403。
- 页面只读，不提供执行 SQL 或删除按钮。
- 支持复制安全摘要，不包含密钥、Token、库存明文或交付明文。

## 上线前数据封板流程

文档：

- `docs/production-data-readiness.md`
- `docs/production-data-cleanup-runbook.md`

流程包括备份、暂停写入、dry-run、人工核对、逐段清理、重新检查、初始化配置、RLS 验证、支付关闭状态验证、库存状态验证和上线后观察。

## 发现的问题

- 缺少统一的生产数据封板只读页面。
- 缺少测试数据 dry-run SQL。
- 缺少默认注释的清理模板。
- 缺少数据来源标识的兼容设计。

## 已修复的问题

- 新增只读扫描服务和后台页面。
- 新增 dry-run SQL 和清理模板。
- 新增数据来源标识 migration。
- 新增生产封板流程文档。

## 仍存在的问题

- 未连接生产数据库执行实际扫描。
- 未自动执行 migration。
- 历史数据需要人工核对后再标记来源。
- 真实支付 Provider 未接入前，支付渠道必须保持关闭或未配置。

## 需要执行的 Migration

按需手动执行：

1. `supabase/migrations/20260630_data_origin_labels.sql`
2. 如尚未执行订单查询凭证：`supabase/migrations/20260630_order_query_tokens.sql`

## 测试结果

- dry-run 脚本：静态检查为只读 SELECT。
- cleanup 模板：默认全注释，不提供一键删除。
- readiness 页面：代码级新增，等待本地 build 验证。
- 普通用户访问：依赖 `requireApiAdmin`，服务端返回 401/403。
