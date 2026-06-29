# Jianlian Shop 数据库备份与恢复方案

## 备份范围

优先级最高的表：

- `auth.users`：由 Supabase Auth 管理，使用 Supabase 项目级备份能力。
- `public.profiles`：用户角色、余额占位、邀请码归属。
- `public.orders`、`public.order_items`、`public.order_status_logs`、`public.order_deliveries`：订单和交付链路。
- `public.account_recharges`、`public.payment_sessions`、`public.order_payments`、`public.payment_callback_logs`、`public.balance_transactions`、`public.payment_reconciliations`：充值、支付、余额流水和对账。
- `public.digital_inventory`、`public.digital_inventory_batches`：数字库存和批次，必须加密备份。
- `public.products`、`public.categories`、`public.product_skus`、`public.product_option_groups`、`public.product_option_values`、`public.product_sku_values`：商品、分类和 SKU。
- `public.admin_audit_logs`、`public.page_visit_events` 或 `visitor_events`：审计与统计。

## 推荐周期

- 每日：逻辑导出关键业务表，保留 14 天。
- 每周：完整数据库备份，保留 8 周。
- 每月：归档备份，保留 12 个月。
- 大版本上线前：手动创建一次完整备份和一份关键表导出。

## 加密和保存

- 数字库存、订单、支付、余额流水备份必须加密后离线或异地保存。
- 备份文件名不要包含用户邮箱、订单号、密钥或库存明文。
- 加密密钥不得写入 Git、文档、PM2 配置或前端环境变量。
- 至少保留一个异地副本，权限只开放给超级管理员。

## 示例命令

以下命令只作为人工执行示例，不在应用中自动执行：

```bash
# Linux 服务器或安全运维机，使用真实连接串前先确认权限
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --file="backup/jianlian_full_$(date +%F_%H%M).dump"

# 关键表导出示例
psql "$SUPABASE_DB_URL" -c "copy (select * from public.orders) to stdout with csv header" > backup/orders.csv
```

数字库存导出后必须立即加密：

```bash
gpg --symmetric --cipher-algo AES256 backup/digital_inventory.csv
shred -u backup/digital_inventory.csv
```

## 恢复步骤

1. 暂停写入：临时停止前台下单、充值、支付回调、自动发货和库存导入入口。
2. 记录当前 Git commit、Supabase migration 状态和 PM2 状态。
3. 先对当前故障数据库做一份只读备份，避免覆盖最新数据后无法追溯。
4. 在临时 Supabase 项目或 staging 数据库中恢复备份。
5. 校验关键表数量、最近订单、余额流水、库存状态和交付记录。
6. 确认恢复点不会覆盖线上新订单和支付记录。
7. 将生产库切换到确认后的恢复数据，或按表级别导入缺失数据。
8. 恢复写入入口。
9. 执行上线后健康检查。

## 恢复后校验

- 订单数量、订单金额合计、支付会话数量、余额流水合计必须能解释差异。
- `orders.total_amount` 与 `order_items.line_total` 汇总一致。
- `balance_transactions` 不出现重复入账。
- `digital_inventory` 不出现同一 `content_hash` 多次可用。
- 已交付库存不能恢复为 `available`。
- 管理员账号 `profiles.role = admin`。

## 灾难恢复检查清单

- [ ] 当前故障现场已备份。
- [ ] 写入入口已暂停。
- [ ] 目标恢复点已确认。
- [ ] 数字库存备份已加密。
- [ ] 订单、支付、余额、库存、交付已抽样校验。
- [ ] Nginx、PM2、Supabase 环境变量未泄露。
- [ ] 恢复后首页、登录、下单、后台、订单和充值页面可打开。