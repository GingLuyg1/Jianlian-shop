# 数据一致性巡检运行手册

## 巡检接口

- 后台页面：`/admin/system/data-consistency`
- 后台手动执行：`POST /api/admin/system/data-consistency`
- 后台读取记录：`GET /api/admin/system/data-consistency`
- 内部定时入口：`POST /api/internal/data-consistency`

所有接口只执行只读业务检查；仅写入巡检运行记录和异常记录，不修改订单、支付、充值、退款、余额、库存或交付业务数据。

## 认证方式

- 后台页面和后台 API：必须登录，并且当前账号邮箱为超级管理员邮箱 `gac000189@gmail.com`。
- 内部定时入口：请求头 `x-data-consistency-secret` 或 `Authorization: Bearer <secret>` 必须匹配环境变量 `DATA_CONSISTENCY_SCAN_SECRET`。
- 不要将 `DATA_CONSISTENCY_SCAN_SECRET` 放入浏览器端 `NEXT_PUBLIC_*` 环境变量。

## 推荐频率

- 支付和充值高峰期：每 15 分钟一次。
- 常规运营期：每 30-60 分钟一次。
- 发布后 24 小时：建议每 15 分钟一次，并人工查看 P0/P1。
- 大批量库存导入、支付渠道切换、订单状态修复后：手动执行一次。

## 手动执行方法

后台执行：

1. 使用超级管理员登录后台。
2. 打开 `/admin/system/data-consistency`。
3. 点击“立即巡检”。
4. 查看 P0/P1 异常，进入详情核对摘要和建议。
5. 处理后填写备注并标记“处理中 / 已解决 / 已忽略”。

内部接口执行示例：

```bash
curl -X POST https://example.com/api/internal/data-consistency \
  -H "x-data-consistency-secret: $DATA_CONSISTENCY_SCAN_SECRET"
```

## 定时任务示例

Linux cron 示例，仅供人工配置参考，本项目不会自动写入服务器配置：

```cron
*/30 * * * * curl -fsS -X POST https://www.jianlian.shop/api/internal/data-consistency -H "x-data-consistency-secret: ${DATA_CONSISTENCY_SCAN_SECRET}" >/var/log/jianlian-data-consistency.log 2>&1
```

PM2 或其他调度器也应只调用内部接口，不要直接执行数据库 SQL。

## 异常处理顺序

1. 先处理 P0：重复入账、超额退款、重复支付、重复交付、跨 SKU 发货。
2. 再处理 P1：支付状态不一致、余额流水缺失、无主预留库存、币种不一致。
3. 对 Provider 未配置导致无法确认的异常，先标记“处理中”，等待渠道后台核对。
4. 对历史迁移导致但已确认无风险的异常，可填写备注后标记“已忽略”。
5. 修复必须通过已有业务服务、RPC 或后台受控操作完成，不要直接改生产表。

## P0 处理原则

- 不要自动修复资金和库存数据。
- 不要删除支付、充值、退款、库存或交付记录。
- 重复入账风险：先冻结相关人工操作，核对支付回调、充值 RPC 和余额流水。
- 超额退款风险：暂停该订单后续退款，核对退款单、订单金额和 Provider 后台。
- 重复交付或跨 SKU 发货：暂停自动补发，核对订单项 SKU、库存批次和交付记录。

## 日志位置

- 巡检运行记录：`public.data_consistency_runs`
- 巡检异常记录：`public.data_consistency_issues`
- 管理员处理审计：`public.admin_audit_logs`
- 服务端错误日志：应用运行日志或平台日志

## 安全注意事项

- 巡检输出不包含完整支付回调原文、密钥、Token、数字库存内容、卡密、账号密码。
- 普通用户不能访问巡检页面和巡检 API。
- 巡检页面不提供 SQL 执行、余额调整、支付状态修改、库存释放或重分配按钮。
- 缺少 migration 时先执行 `supabase/migrations/20260630_data_consistency_scan.sql`。
- 缺少真实 Provider 时只能确认本站数据，不能推断外部支付或退款已成功。
