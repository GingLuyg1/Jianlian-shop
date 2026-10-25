# Bitrefill 无 Business 凭据开发 V2 — 本地交付

日期：2026-10-25。工作树 `D:/Jianlian/Jianlian-shop-bitrefill-final-connect-v1`，分支 `codex/bitrefill-final-connect-v1`，基线 `018b392bdcbbc56b970516e753a9fc2090ddc7a1`。

## 结论与边界

完成独立的、仅监听 `127.0.0.1` 的 Mock HTTP 供应商和合成商城 HTTP 验收，以及后台只读采购面板。没有构造或使用 Business 凭据，没有调用真实供应商接口。所有价格、成本、商品、卡密、余额和订单均为明确标注的合成夹具。

保留上一轮 296 套餐解析修复、512/513 边界及 1504 项基线测试。本轮新增测试覆盖，不撤销既有修改。所有改动仍在当前独立分支，未 Push、Merge 或部署。

**不能将本结果解释为 Production 可采购、DB9 已安装或真实退款已打通。** 真实服务端 Registry 仍只有 Daju，真实采购常量仍为 `false`，GET-only Transport 没有改成可购买。

## 复用的实际代码

HTTP 验收调用实际 `balance-payment-service.ts`，实际 `delivery-service.ts` / Supplier Router，既有 P2 本地依赖注入工厂、P1 参数冻结/认领逻辑、GET 对账及既有私密交付 RPC 接口。TS 测试加载器替换外部服务依赖；不加载真实 Supabase 客户端。

- 创建订单为本机 Mock HTTP checkout + 服务端合成目录/价格；**没有运行生产 `POST /api/orders`、其风控/协议确认或 `create_order_with_item` 的真实 SQL**。
- 余额支付经过实际 TS 服务，但底层财务 RPC 是合成账本；不是 Production 余额扣款验收。
- PostgreSQL 验收使用独立 `mock_supplier_v2.state` CAS 夹具和低权限 `mock_app` 角色。事务内不调用供应商 HTTP。它验证 Mock 接口适配和并发去重，**不是 DB9 五张表/六个 RPC/RLS 的再次验收**。
- 不读取、不执行任何 migration；本轮没有运行此前会安装 DB9 的旧 PostgreSQL harness。
- Daju 的网络处理器仅在测试加载器中为空桩；Daju 自身回归仍由原完整测试集验收，生产实现和 Registry 未改。
- 现有客户 `SecureOrderDelivery.tsx` 通过浏览器夹具验证隐藏/显示/再次隐藏合成卡密；生产卡密查看接口和权限未修改。

## 已覆盖的 Mock 行为

1. HTTP 合成订单创建、请求幂等、余额支付、权威 paid 状态检查，重复支付通知只扣一次。
2. 进入既有采购认领边界，冻结 SKU/成本/语义参数；并发 worker 只能提交一次逻辑采购。
3. Invoice 与 Child 分别保存；正常路径仍为一 item 一 invoice。另用既有 offline batch API 验证多 Child：显式 `client_reference`，GET 故意倒序，缺少关联证据即拒绝。该字段仅是 Mock 证据，**不声称真实供应商支持或已验证**。
4. 模拟未付款、余额自动付款、分开付款、处理中、成功、失败、部分成功、已接受后连接中断，以及商品身份错误。
5. Webhook 仅带唤醒 ID；伪造状态/卡密不进入交付。重复/延迟事件和 Poll 并发不重复交付。
6. 超时后保留 UNCERTAIN，禁止重发 POST；已知 Invoice 只 GET 对账。未知 Child 转人工处理，不发货、不自动退款。
7. 私密卡密只通过既有交付接口形状写入独立 Mock 私密集合，普通订单和后台投影不含卡密，HTTP 客户身份只能取自己的卡密。
8. 部分失败时成功 item 保留交付，失败 item 先 GET 核对，再进入 **Mock 管理员审核退款**。合成事务内检查原扣款、未交付、退款上限和唯一 credit；重复审核只退一次。**不调用/改变真实退款接口。**
9. 缺少可信成本、成本超限、未匹配套餐均无法提交采购。生产 Apple SKU 没有写入绑定、没有启用。

## Business Adapter

新增 `business-adapter.mjs`：仅接受显式 Business ID/Secret，拒绝 Personal fallback；无环境变量读取、无默认商业授权。合同引用、单项 Invoice 策略、余额付款及 auto-pay / separate-payment 必须显式配置并经过审批。

复用独立 purchase HTTP Transport，增加仍受同一关闭门禁保护的 `payInvoice`。默认 auto-pay 行为不变；新增显式 autoPay 参数供未来独立授权使用。Business 工厂始终 `purchaseEnabled=false`，不能从当前配置启用购买。

依据 [Business API 官方文档](https://docs.bitrefill.com/docs/Common%20Use%20Cases) 使用 Basic 认证、v2 端点；依据 [官方集成流程](https://docs.bitrefill.com/docs/integration-flow) 构造 `products` / `payment_method=balance` / `auto_pay`，分开余额付款的 `/invoices/{id}/pay` 使用空 JSON body。POST 仅在 Mock HTTP 实例执行，实站没有发出请求。

分开付款目前只有适配和 Mock 合同测试，**没有启用真实 worker 的二阶段付款**；未来若启用此模式，须先审查 Invoice 落库后的付款认领、超时对账和扣款防重，而不能直接调用两次 POST。

## 后台接线

- 页面：`/admin/suppliers/bitrefill`，从原供应商工作区有只读入口。
- API：`GET /api/admin/suppliers/bitrefill/fulfillment?page=1`，超级管理员授权先于 Service Client 创建；`no-store`，无 POST/PATCH/DELETE。
- 每页 25 个采购请求，受限读取 item/child/root/订单号，最多展示本页最近 200 条安全对账记录；支持空状态、分页、失败与重试。
- 冻结成本显示“真实成本未验证”，展示 Invoice/Child/履约状态、人工核对提示、按订单号跳转既有订单处理页、既有退款审核入口。
- 不读取私密卡密、完整 Webhook 或供应商原始响应。不提供“重发采购”按钮。
- DB9 未安装或权限未就绪时返回脱敏 503，不自动安装、不构造假记录。

## 本轮验证

最终真实结果见外部证据目录 `D:/Jianlian/_bitrefill_mock_supplier_v2_20261025/`：

- 定向新增用例和 P1 回归通过；新增合成分开付款测试证明重复 pay 只有一笔合成供应商 debit。
- 全套 Node：**1512/1512 PASS，失败 0、跳过 0**，最终日志 `full-suite.log`。既有 1504 项 + 本轮新增 8 项；未删除或弱化基线断言。
- PostgreSQL 17.11：最终 `pg-synthetic-wVZX92/result.json`，43 项 HTTP/并发断言、两个独立 PostgreSQL 后端；测试后实例已停止。
- 浏览器：`ui-result.json`，真实 React 组件由本机夹具挂载，覆盖空状态、成本/Child/部分失败、分页、读取失败重试、1440/390 无横向溢出，以及既有客户组件合成卡密遮盖/显示/隐藏。
- 浏览器夹具的外部网络被阻断；仅部分 UI 依赖被替换，样式为夹具样式，**不冒充带 Supabase 登录的完整 Next 浏览器验收**。
- TypeScript、所有新增/修改 MJS 定向 ESLint、TSX/Route 定向 Next Lint、正常 Next Build 通过。Build 有既有 ws 可选依赖、Supabase 动态依赖及 CSR deopt 警告，未更改字体/页面逻辑规避构建。
- frozen DB9 SHA256 不变：`90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。
- 定向 Secret 格式扫描没有发现私钥正文、Supabase Secret Key 或 GitHub Token；这只是范围限定的模式扫描，不代表通用 DLP 认证。没有读取、复制或记录真实 Business/Personal 凭据。

可重复执行（仓库目录）：

```powershell
node --test tests/unit/bitrefill-mock-http.test.mjs tests/unit/bitrefill-mock-contract.test.mjs
node scripts/verify-bitrefill-mock-pg.mjs
node scripts/verify-bitrefill-mock-ui.mjs
npm run typecheck
npm run build
```

PG 脚本使用已有 portable PostgreSQL 17.11，仅新建一次性合成目录，子进程不继承真实数据库或供应商凭据，数据库只有本机端口。它不会覆盖此前数据库、读取旧密码文件或执行 DB9。Windows 受限沙箱启动失败时，应使用已授权普通用户运行，不改 PostgreSQL/主机权限。

## 剩余商业与发布依赖

需要正式 Business 准入和可用凭据、实际可售目录与精确商品/SKU 映射、可信供应商成本及币种/利润规则、真实 Child 身份证据、Webhook 认证合同、退款/付款商业合同，以及 DB9 安装与服务端部署的各自独立授权。

面值不能代替采购成本，Personal GET 不能代替转售许可；Mock 关联字段不能代替真实证据。当前可以本地代码审查和离线回归，不可启用真实自动采购。

本轮未进行本地提交，便于把原有解析修复与新增 Mock/UI 差异分别审阅；所有既有未提交成果保留。无需用户提供 Business 凭据即可重跑本地 Mock 验收。完成后停止。
