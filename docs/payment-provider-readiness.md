# Jianlian Shop 支付 Provider 接入准备报告

> 检查日期：2026-06-23
> 检查范围：支付、账户充值、余额、商品订单、数字库存、自动发货、后台运维。
> 检查方式：代码与 SQL 静态联调检查；未执行 Supabase migration，未连接真实 Provider，未模拟支付成功。

## 最终结论

**暂不可以接入真实 Provider。**

当前项目已具备支付记录、充值记录、渠道配置、回调日志表、对账记录、订单、数字库存、交付记录、管理员审计和后台页面等基础模块；但真实自动支付闭环仍缺少以下关键能力：

1. 缺少独立 `payment_sessions` 表及统一支付会话服务。
2. 缺少真实 `POST /api/payments/callback` 回调入口和原始请求体验签链路。
3. 缺少 `balance_transactions` 余额流水表。
4. 缺少 `complete_account_recharge` 原子入账 RPC。
5. Provider 全部是不可用占位实现，不能创建、查询或关闭真实支付。
6. `payment_channels` 当前只保存脱敏密钥，无法作为真实 Provider 的可信密钥来源。
7. `payment_channels` 对 enabled 行存在公开读取策略，表内同时包含 API 地址、商户号等管理字段，接入前必须拆分公开配置与私密配置或限制列访问。
8. 存在 `account_recharges` 与 `recharge_records` 两套充值数据结构，当前运行代码使用 `account_recharges`，需要明确废弃或迁移另一套，避免双写和对账分叉。

在补齐上述模块并完成沙箱回调、幂等、金额校验、余额原子入账测试前，不应配置生产商户密钥或开放自动到账。

## 一、支付相关 SQL 与 Migration 盘点

### 基础 SQL

| 文件 | 创建或修改内容 | 依赖与备注 |
| --- | --- | --- |
| `supabase/orders-schema.sql` | `orders`、`order_items`、`order_status_logs`、`order_deliveries`；订单 RLS；订单创建和管理员状态 RPC | 必须先于订单支付、库存和发货 migration 执行 |
| `supabase/profiles.sql` | 用户 profile、角色、余额基础字段（以实际线上结构为准） | 支付后台依赖 `profiles.role` 和 `is_admin` |
| `supabase/schema.sql` | 商品与分类基础结构（以实际线上结构为准） | 订单和库存依赖 `products`、`categories` |

### 实际存在的支付相关 Migration

| 顺序 | Migration | 创建或修改的表 / RPC | 检查结果 |
| --- | --- | --- | --- |
| 1 | `20260620_order_payments.sql` | 创建 `order_payments`；Storage `payment-proofs`；`submit_order_payment`、`admin_review_order_payment` | 人工凭证支付链路，非自动 Provider 会话 |
| 2 | `20260620_digital_inventory_delivery.sql` | 创建 `digital_inventory`；扩展订单创建、库存预留、订单状态、发货 RPC | 依赖订单、商品表；后续被 hardening migration 覆盖部分函数 |
| 3 | `20260622_digital_delivery_hardening.sql` | 加固 `digital_inventory`、`order_deliveries`；创建 `digital_delivery_secrets`、`delivery_logs`；重定义自动发货与订单状态 RPC | 必须在基础库存 migration 后执行 |
| 4 | `20260623_mixed_order_item_fulfillment.sql` | 增加订单/订单项履约状态；创建 `order_item_delivery_logs`；继续加固 `order_deliveries` 与混合订单发货 | 必须在 hardening 后执行 |
| 5 | `20260622_super_admin_payment_console.sql` | 扩展 `order_payments`；创建 `account_recharges`、`payment_callback_logs`、`payment_channels`；配置 RLS | 当前充值 API 使用这一套 `account_recharges` |
| 6 | `20260622_recharge_records.sql` | 创建独立 `recharge_records` | 与 `account_recharges` 业务重复；当前应用未使用，建议标记为 legacy，不纳入生产主链路 |
| 7 | `20260623_payment_reconciliation_system.sql` | 创建 `payment_reconciliations`、索引与 RLS | `payment_session_id` 实际兼容指向支付记录 ID，没有 FK，也没有真实 `payment_sessions` 表 |
| 8 | `20260623_admin_audit_logs.sql` | 创建 `admin_audit_logs`、索引与只读 RLS | 服务端写入，后台只读 |
| 9 | `20260623_digital_inventory_batches.sql` | 创建 `digital_inventory_batches`；扩展 `digital_inventory` 批次、哈希和禁用字段 | 必须在数字库存基础表后执行 |

### 结构冲突与兼容风险

1. **充值双表**：`account_recharges` 与 `recharge_records` 字段和状态相似，但当前 `/api/recharges`、后台充值和对账服务只使用 `account_recharges`。
2. **支付记录与支付会话混用**：对账服务将 `order_payments.id` 或 `account_recharges.id` 当作 `payment_session_id`；缺少真正的会话过期、复用和关闭模型。
3. **状态范围逐步扩展**：`order_payments` 初始状态约束由后续 migration 重建，执行顺序错误会导致状态写入失败。
4. **订单与发货 RPC 被多次重定义**：后执行的 hardening 和 mixed fulfillment migration 才是有效版本，不能乱序。
5. **回调日志存在但无回调 API**：表结构不能替代验签、金额校验和幂等处理。
6. **余额字段存在但无可信流水闭环**：没有发现 `balance_transactions` 和原子充值入账 RPC。
7. **SQL 中文消息存在编码显示风险**：部分文件在当前终端显示乱码。正式执行前应确认文件实际保存为 UTF-8，并在测试项目先执行。

## 二、建议的手动执行顺序

以下顺序仅用于尚未初始化的新环境。生产环境应先查询表、约束、函数和已执行 migration，再逐个执行；本次检查未自动执行 SQL。

1. `supabase/profiles.sql`
2. `supabase/schema.sql`
3. `supabase/orders-schema.sql`
4. `supabase/migrations/20260620_order_payments.sql`
5. `supabase/migrations/20260620_digital_inventory_delivery.sql`
6. `supabase/migrations/20260622_digital_delivery_hardening.sql`
7. `supabase/migrations/20260623_mixed_order_item_fulfillment.sql`
8. `supabase/migrations/20260622_super_admin_payment_console.sql`
9. `supabase/migrations/20260623_payment_reconciliation_system.sql`
10. `supabase/migrations/20260623_admin_audit_logs.sql`
11. `supabase/migrations/20260623_digital_inventory_batches.sql`

`20260622_recharge_records.sql` 当前不建议加入生产主链路。若线上已执行，应保留表但停止新写入，并制定迁移到 `account_recharges` 的一次性方案。

真实 Provider 接入前还需要新增并单独执行：

- `payment_sessions` migration。
- `balance_transactions` migration。
- `complete_account_recharge` 原子入账 RPC migration。
- 回调幂等约束、渠道交易号唯一约束和支付会话有效状态唯一约束 migration。

## 三、支付渠道检查结果

### 已覆盖渠道

| 渠道代码 | 币种 | 网络 | 默认状态 | Provider 状态 |
| --- | --- | --- | --- | --- |
| `alipay` | CNY | — | migration 默认禁用 | `generic_api` 占位，不可用 |
| `wechat` | CNY | — | migration 默认禁用 | `generic_api` 占位，不可用 |
| `binance_pay` | USDT | Binance | migration 默认禁用 | `binance` 占位，不可用 |
| `usdt_trc20` | USDT | TRC20 / TRON | migration 默认禁用 | `crypto_address` 占位，不可用 |
| `usdt_bep20` | USDT | BEP20 / BSC | migration 默认禁用 | `crypto_address` 占位，不可用 |

### 已满足

- 前台充值页从 `/api/recharges/channels` 读取数据库中 `enabled = true` 的渠道。
- 最低金额和手续费由服务端重新读取并计算。
- TRC20 与 BEP20 使用不同渠道代码和网络映射。
- Provider 未配置时不会返回假二维码、假地址或假跳转链接。
- 全部渠道禁用时前台显示“支付渠道暂未开放”。

### 未满足与风险

- `payment_channels` 的公开 enabled 行 RLS 是行级限制，不是列级限制。直接使用 anon key 查询该表时，理论上可读取 `api_url`、`merchant_id`、`app_id`、`callback_url` 和脱敏密钥字段。接入前必须拆分公开表/私密表，或只通过安全 API 输出白名单字段。
- 后台仅保存 `secret_key_masked`、`signing_key_masked`，不能恢复真实密钥。真实密钥应来自服务端环境变量或只允许服务端解密的安全存储。
- 静态 `lib/payments/channels.ts` 中存在 enabled 的展示默认值，但当前充值页走服务端渠道 API；接入时仍应避免其他页面误用静态配置绕过数据库启停状态。

## 四、充值创建链路检查结果

当前链路：

`用户输入金额 → POST /api/recharges → 服务端读取 enabled 渠道 → 服务端计算手续费 → 插入 account_recharges → 调用 Provider.createPayment`

### 已满足

- 未登录用户无法创建充值单。
- 请求白名单只接受 `channel` 和 `amount`。
- 手续费、应付金额和 credited amount 不由前端提交。
- CNY 按 2 位、USDT 按 6 位处理。
- 用户列表查询按当前 user id 限制。
- Provider 未配置时充值单保持 pending，不伪造成功。

### 未满足与风险

- 缺少 `payment_sessions`，无法复用有效会话、记录 expires_at 或安全重建过期会话。
- 重复点击会先创建多个 `account_recharges`，没有 client request id 或有效会话唯一约束。
- 当前 RLS 允许 authenticated 用户直接 insert 自己的 `account_recharges` pending 记录，可能绕过服务端金额计算。真实支付前应禁止浏览器直接插入，改由可信服务端写入。
- Provider 创建失败后会保留 pending 充值单，但没有会话失败/过期清理规则。

## 五、支付会话生命周期检查结果

**缺少独立支付会话实现。**

未发现：

- `payment_sessions` 表。
- `POST /api/payments/create`。
- `GET /api/payments/status/[sessionNo]`。
- `POST /api/payments/close`。
- `expirePaymentSession` / `closePaymentSession`。
- `/payment/result` 自动支付轮询页面。

现有 `/payment` 是人工支付凭证上传页面，不是 Provider 支付结果轮询页。现有对账服务将支付记录 ID 当作“会话 ID”，不能替代真实支付会话生命周期。

## 六、回调与幂等检查结果

### 已存在

- `payment_callback_logs` 表。
- Provider 接口定义包含 `verifyCallback` 和 `parseCallback`。
- 渠道交易号部分表上有唯一索引。

### 缺失

- 未发现 `POST /api/payments/callback` 路由。
- 未实现读取原始请求体、渠道签名头和验签。
- 未实现业务单号、金额、币种、渠道代码联合校验。
- 未实现回调幂等键或回调处理事务。
- 未实现同一交易号跨业务单冲突拒绝。
- Provider 的 `verifyCallback` 永远返回 false，`parseCallback` 直接报“渠道暂未配置”。

因此当前不能接收任何真实支付回调，也不能通过回调确认到账。

## 七、原子入账和余额流水检查结果

**未发现可用的真实充值原子入账闭环。**

缺失：

- `balance_transactions` 表。
- `complete_account_recharge` RPC。
- 充值单状态更新、`profiles.balance` 增加、流水写入的同一数据库事务。
- 金额不一致拒绝与重复调用幂等返回。

现有 `account_recharges.credited_amount` 初始写入 0，符合预期；但没有可信流程将其更新并同步余额。对账服务也明确将“渠道已支付、本地未入账”标记为人工复核，不会伪造入账。

## 八、订单支付与数字发货检查结果

### 已满足

- 订单、订单项、状态日志、交付记录结构已存在。
- 强化后的数字发货函数会先检查 `order.payment_status = paid`。
- 库存使用行锁和 `FOR UPDATE SKIP LOCKED`，降低并发重复分配风险。
- `order_deliveries.inventory_id` 有已交付唯一约束，单条库存不能重复交付。
- 已交付密钥移动到私密表，日志和普通交付记录不保存完整卡密。
- 库存不足时写失败交付记录，订单转 processing，支付状态不回滚。
- 混合订单支持按订单项维护履约状态。

### 风险

- 自动发货目前主要由管理员将订单状态改为 paid 后触发，而不是真实支付回调的可信支付成功服务。
- `admin_update_order_status` 仍允许后台人工将订单标记为 paid，并扣减/触发发货；真实 Provider 上线后需明确保留为应急操作还是限制为审计后的补单流程。
- 多个 migration 重定义发货函数，必须确保线上最终函数来自最新 hardening/mixed fulfillment 文件。
- SQL 中文错误文本需确认 UTF-8，否则后台可能显示乱码。

## 九、后台支付运维能力检查结果

### 已具备

- `/admin/payments`：支付记录、异常支付、对账记录、详情、回调摘要。
- `/admin/recharges`：充值记录和详情。
- `/admin/audit-logs`：管理员操作审计。
- `/admin/inventory`：库存汇总、批次、脱敏库存、导入、禁用和恢复。
- `/admin/orders`：订单筛选、状态处理、交付记录、人工/自动发货操作。
- `/admin/settings`：支付渠道启停、最低金额、手续费、网络和 Provider 配置界面。
- 后台 API 普遍使用服务端 `getServerAdminContext` 校验管理员。
- 缺表时多数页面有中文初始化提示和局部错误状态。

### 未具备或需限制

- 没有真实 `payment_sessions` 的后台会话列表和关闭操作。
- Provider 全部未配置，对账查询只能产生 provider_unconfigured / query_failed。
- 后台渠道设置返回 API URL 和脱敏商户信息给管理员浏览器；接入生产密钥前应改为只返回“是否已配置”和末四位。
- `/admin/orders` 具备人工改 paid 的能力，不符合纯自动支付模式下“无直接改 paid 按钮”的要求，需要在 Provider 上线方案中明确处置。
- 当前只区分 `admin` 与普通用户，没有独立 super_admin 角色；本报告按现有 admin 视为超级管理员。

## 十、必须配置的环境变量

### 当前已有基础变量

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PAYMENT_RECONCILIATION_SECRET 或 INTERNAL_API_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` 只能存在于服务器环境，禁止使用 `NEXT_PUBLIC_` 前缀。

### 接入真实 Provider 后应新增

按 Provider 分组配置，具体名称可在实现时确定：

```text
PAYMENT_PROVIDER_API_BASE_URL
PAYMENT_PROVIDER_MERCHANT_ID
PAYMENT_PROVIDER_APP_ID
PAYMENT_PROVIDER_SECRET_KEY
PAYMENT_PROVIDER_SIGNING_PRIVATE_KEY
PAYMENT_PROVIDER_VERIFY_PUBLIC_KEY
PAYMENT_PROVIDER_CALLBACK_SECRET
PAYMENT_PROVIDER_CALLBACK_URL
PAYMENT_PROVIDER_RETURN_URL
PAYMENT_PROVIDER_TIMEOUT_MINUTES
```

如多个 Provider 并存，应使用渠道前缀，例如 `ALIPAY_*`、`WECHAT_*`、`BINANCE_PAY_*`，并确保前端永远无法读取。

## 十一、支付平台必须提供的信息

- 创建支付接口 URL、HTTP 方法、请求字段和签名原文规则。
- 查询支付接口和终态定义。
- 关闭支付接口及可关闭状态。
- 回调地址协议、请求方法、Content-Type 和原始请求体要求。
- 签名算法、字符集、字段排序、时间戳和 nonce 规则。
- 回调成功响应格式及重试策略。
- 渠道代码与平台渠道枚举。
- 金额单位（元、分、USDT 最小单位）和精度规则。
- 支持币种和汇率责任边界。
- 订单有效期及最短/最长超时。
- 渠道交易号唯一性规则。
- IP 白名单、域名白名单和证书要求。
- 测试环境 / 沙箱地址和测试账号。
- 商户号、App ID、密钥类型和密钥轮换方式。
- 支付成功、失败、关闭、过期、退款等状态映射。
- 回调重复次数、查询限频和 API 限流规则。

## 十二、真实 Provider 接入前检查清单

- [ ] 选定唯一充值主表，停止 `account_recharges` / `recharge_records` 双轨。
- [ ] 创建 `payment_sessions` 及有效会话唯一约束。
- [ ] 实现统一创建、查询、关闭服务。
- [ ] 实现 `/api/payments/callback` 原始请求体验签。
- [ ] 为回调建立幂等键和渠道交易号跨业务唯一约束。
- [ ] 创建 `balance_transactions`。
- [ ] 创建并测试 `complete_account_recharge` 原子 RPC。
- [ ] 将公开渠道字段与私密 Provider 配置拆分。
- [ ] 禁止浏览器直接插入充值和可信支付状态。
- [ ] 接入真实 Provider adapter，不允许 fallback 返回假数据。
- [ ] 将支付成功处理封装为单一可信服务，统一处理订单和充值。
- [ ] 确认支付成功与数字发货解耦：发货失败不回滚支付。
- [ ] 确认所有回调、入账、发货均可重复调用且不重复执行。
- [ ] 确认管理员人工 paid 操作的审计和使用边界。
- [ ] 在测试 Supabase 项目执行全部 migration 并核对函数最终版本。
- [ ] 验证 SQL 文件 UTF-8 编码和中文错误信息。

## 十三、测试场景清单

### 渠道与金额

- enabled / disabled 渠道展示。
- CNY 两位、USDT 六位精度。
- 最低金额、手续费、零手续费。
- TRC20 与 BEP20 网络不可混用。
- Provider 缺失时不生成假支付信息。

### 支付会话

- 首次创建、重复创建复用、过期后重建。
- 已支付和已取消业务禁止创建。
- 过期、关闭和重复关闭幂等。
- 前端篡改金额无效。

### 回调

- 正确签名、错误签名、缺少签名。
- 重复回调。
- 金额不一致、币种不一致、业务单号错误。
- 同一交易号绑定不同业务单。
- 回调先于前端轮询、轮询先于回调。

### 充值入账

- 正常入账。
- RPC 重复调用不重复加余额。
- 状态更新成功但流水失败时整体回滚。
- 余额增加成功但充值单更新失败时整体回滚。
- credited_amount 初始为 0，到账后等于实际入账金额。

### 订单与发货

- 支付成功后只处理对应订单。
- 自动商品库存充足、库存不足、部分不足。
- 重复回调不重复发货。
- 混合订单逐项发货。
- 发货失败保持已支付并转处理中。
- 已交付库存不能恢复 available。
- 日志、审计和页面不泄露完整卡密。

### 权限与降级

- 普通用户不能访问后台支付、充值、审计、库存数据。
- anon 不能读取私密渠道配置。
- 浏览器不能调用可信入账服务。
- migration 缺失时显示中文提示而非白屏。
- Provider 超时、限流、错误响应时不误判 paid。

## 已完成模块

- 订单与订单项基础结构。
- 人工支付凭证记录和管理员审核。
- 账户充值单基础结构与服务端金额计算。
- 五个渠道的数据库配置框架。
- Provider 接口抽象和安全的“未配置”降级。
- 支付回调日志表结构。
- 支付对账记录和查询框架。
- 管理员支付、充值、对账、渠道、审计页面。
- 数字库存、批次、私密交付、交付日志和混合订单履约。
- 管理员审计日志框架。

## 缺失模块

- 独立支付会话表与生命周期 API。
- 真实 Provider adapter。
- 真实回调入口与验签处理。
- 余额流水表。
- 充值原子入账 RPC。
- 自动支付成功统一事务服务。
- 公开渠道配置与私密 Provider 配置隔离。
- 充值双表收敛方案。

## 风险等级摘要

| 风险 | 等级 | 说明 |
| --- | --- | --- |
| 缺少回调验签与幂等 | 阻断 | 无法可信确认支付成功 |
| 缺少原子余额入账 | 阻断 | 可能出现状态与余额不一致 |
| 缺少 payment_sessions | 高 | 无法可靠复用、过期、关闭和轮询 |
| 渠道私密字段与公开表同表 | 高 | anon RLS 仅限制行，不能限制列 |
| 充值双表 | 高 | 可能产生统计、对账和用户记录分叉 |
| 人工修改订单 paid | 中 | 真实自动支付上线后需限制或保留为审计补单 |
| SQL 中文编码显示异常 | 中 | 可能导致迁移错误消息乱码，需测试环境验证 |
| Provider 未实现 | 阻断 | 当前所有渠道均无法真实创建或查询支付 |
