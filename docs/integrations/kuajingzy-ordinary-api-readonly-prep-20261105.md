# KuajingZy 跨境资源网 — 普通 API 只读接入准备（2026-11-05）

## 范围与可信证据

本轮用户明确要求评估和推进 https://888.kuajing.one/pc/#api-docs 供应链。已通过用户浏览器的登录会话阅读该供应商自己的 API 文档；未读取或公开 API 密钥，未调用任何真实供应商 API，未购买或充值。站点业务信誉、供货质量与商业转售授权尚未核实。

其 API 文档包含三种互不兼容协议：普通 API（22 项）、异次元 4.0（11 项）、Dujiao-Next（14 项）。本次只选择普通 API，避免在未审批时把三种签名格式混用。

普通 API 文档中可核实的接口：
- GET /api/open/v1/balance：会员可用余额（CNY）。
- GET /api/open/v1/catalog/mall：跨境商城商品目录。
- GET /api/open/v1/orders：已开放业务订单列表。
- GET /api/open/v1/orders/{id}：订单与交付。
- POST /api/open/v1/orders/mall：真实采购、扣款接口；本次**没有实现、没有调用**。

API origin 为 https://888.kuajing.one，请求使用 Authorization: Bearer API_KEY。成功响应外层为 {data:...}，错误为 {error:{code,message}}。每个新采购需新的 Idempotency-Key；不确定时只可查询原单、不能使用不同键再次下单。该平台不提供第三方回调，也不提供 API 充值，后续履约只能基于认证订单查询。限流为会员 60 次/60秒、IP 300 次/60秒。金额以 CNY 实扣、最多四位小数；页面的 USD=7.2 CNY 为展示价规则，不能当作 Jianlian Shop 的实时外汇结算依据。

**最关键前置条件：** 用户在登录 API 页面看到“尚未申请”；必须由账号持有人在“申请 / 查看 API 接入”申请，经平台审批后取得独立 API Key。网页登录态不能替代 API Key。

## 本次实际开发

- lib/providers/kuajingzy/readonly-client.mjs：固定 HTTPS host、严格 GET 路径白名单，仅允许余额和 mall 目录、无重试、无下单方法、12秒可配置超时、256KiB 响应上限、通用脱敏错误、CNY 余额校验。
- tests/unit/kuajingzy-readonly-client.test.mjs：15 个离线模拟测试（正常响应、错误、币种/精度、限流、未授权、超大响应、禁止购买与脱敏）。
- 测试：本地 Node 22 执行 node --test tests/unit/kuajingzy-readonly-client.test.mjs，15/15 PASS。**不是**真实服务器或供货商 API 的验收证据。
- 没有修改全站统一路由、Daju、Bitrefill、支付、数据库、产品绑定、供应商采购开关或 Production 部署。

## 复用现有代码，不重造

已有统一供应商框架 lib/providers/core/fulfillment-core.mjs、supplier-router-core.mjs、purchase-identity-core.mjs，及 Daju 已部署履约、Bitrefill 订单/幂等预算候选。后续必须复用现有商品绑定、订单锁、唯一采购请求、私密交付和对账，不建立第二套采购队列。Bitrefill Draft PR #102 作为独立主线保持不动。

本次不会以“已开发只读客户端”冒充“自动采购已接入”。

## 下一步唯一主线

1. 用户在目标站 API 文档点击“申请 / 查看 API 接入”，完成申请；无需重复操作。若站点允许账号内读写，申请成功后只保存审批状态，不在 GitHub/聊天复制密钥。
2. 审批通过后，Codex 从受保护环境注入 API Key，进行**单次**认证只读余额和 mall 目录 GET。只保存脱敏字段/类型、可售 SKU 及价格/库存是否权威，不保存原始私密信息。若 401/403、无合适商品或协议不完整，停止。
3. 核实所选商品是否允许转售，是否有自动卡密、订单取回、退款及纠纷处理机制。优先选择可验证的合法数字商品，不盲目接入社媒账号、接码或流量类服务。
4. 确认真实 catalog/schema 后，另外起一个**默认禁止采购**的最小 PR：商品 SKU/类型/数量冻结、报价与成交价校验、CNY 毛利与费用、库存新鲜度、单笔/日采购上限、单次持久化 Idempotency-Key、POST 不确定时只查原订单、GET 交付身份与私密交付原子写、防重复发货和紧急开关。
5. 与现有统一后台 UI、Production 与付款测试各自分线。新供应商真实资金或 Production 切换必须另外满足安全门禁并取得明确授权；缺货拒售维持。

## 状态与交接

- 已开发：独立普通 API 只读适配器；15 项合成测试通过。
- GitHub PR：此文件应出现在独立 Draft PR 中；以该 PR 实际 URL/SHA 为证。禁止自动合并或部署。
- 认证真实 API：NOT_RUN（目前密钥申请状态：尚未申请）。
- 自动采购/商品上架：DISABLED。
- 资金变更/Production 数据库写/部署：无。
- 唯一下一步：API 接入申请获批后，完成单次只读余额和目录取证。

Codex 在下次进入本地 Windows 环境时须读取 D:\Jianlian\_project_handoffs\CURRENT_HANDOFF.md、主线独立交接，追加本供应商独立记录及本 PR 的准确状态、测试与证据，不得覆盖其他供应商/支付/USDT/UI 已有成果。
