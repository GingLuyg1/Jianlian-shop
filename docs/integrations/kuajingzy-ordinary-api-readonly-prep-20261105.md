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

**最新账号状态（2026-11-05 晚间）：** 已在账号登录状态的 API 文档确认“已通过”，页面提供掩码后的密钥与复制鉴权头功能。审批门禁已经解除；完整 API Key 未读取、未输出、未提交 GitHub、未配置生产服务器。网页登录态仍不能替代服务器端安全注入的 API Key。

## 本次实际开发

- lib/providers/kuajingzy/readonly-client.mjs：固定 HTTPS host、严格 GET 路径白名单，仅允许余额和 mall 目录、无重试、无下单方法、12秒可配置超时、256KiB 响应上限、通用脱敏错误、CNY 余额校验。
- tests/unit/kuajingzy-readonly-client.test.mjs：15 个离线模拟测试（正常响应、错误、币种/精度、限流、未授权、超大响应、禁止购买与脱敏）。
- 测试：本地 Node 22 执行 node --test tests/unit/kuajingzy-readonly-client.test.mjs，15/15 PASS。**不是**真实服务器或供货商 API 的验收证据。
- 没有修改全站统一路由、Daju、Bitrefill、支付、数据库、产品绑定、供应商采购开关或 Production 部署。

## 复用现有代码，不重造

已有统一供应商框架 lib/providers/core/fulfillment-core.mjs、supplier-router-core.mjs、purchase-identity-core.mjs，及 Daju 已部署履约、Bitrefill 订单/幂等预算候选。后续必须复用现有商品绑定、订单锁、唯一采购请求、私密交付和对账，不建立第二套采购队列。Bitrefill Draft PR #102 作为独立主线保持不动。

本次不会以“已开发只读客户端”冒充“自动采购已接入”。

## 下一步唯一主线

1. API 审批已通过，无需重复申请。由本地 Codex 通过获准的私密方式安全配置 API Key，禁止出现在聊天、GitHub、日志或网页公开内容中。
2. 审批通过后，Codex 从受保护环境注入 API Key，进行**单次**认证只读余额和 mall 目录 GET。只保存脱敏字段/类型、可售 SKU 及价格/库存是否权威，不保存原始私密信息。若 401/403、无合适商品或协议不完整，停止。
3. 核实所选商品是否允许转售，是否有自动卡密、订单取回、退款及纠纷处理机制。优先选择可验证的合法数字商品，不盲目接入社媒账号、接码或流量类服务。
4. 确认真实 catalog/schema 后，另外起一个**默认禁止采购**的最小 PR：商品 SKU/类型/数量冻结、报价与成交价校验、CNY 毛利与费用、库存新鲜度、单笔/日采购上限、单次持久化 Idempotency-Key、POST 不确定时只查原订单、GET 交付身份与私密交付原子写、防重复发货和紧急开关。
5. 与现有统一后台 UI、Production 与付款测试各自分线。新供应商真实资金或 Production 切换必须另外满足安全门禁并取得明确授权；缺货拒售维持。

## 状态与交接

- 已开发：独立普通 API 只读适配器；15 项合成测试通过。
- GitHub PR：此文件应出现在独立 Draft PR 中；以该 PR 实际 URL/SHA 为证。禁止自动合并或部署。
- 认证真实 API：NOT_RUN（账号 API 审批状态：已通过，密钥尚未安全配置到测试环境）。
- 一次性只读探针：`scripts/probe-kuajingzy-readonly.mjs`，仅对余额和 mall 目录各调用 1 次 GET，不打印余额值、商品数据或凭据；合成测试 `tests/unit/kuajingzy-readonly-probe.test.mjs`。
- 自动采购/商品上架：DISABLED。
- 资金变更/Production 数据库写/部署：无。
- 唯一下一步：本地 Codex 安全注入已获批密钥，使用当前 Draft PR 的只读探针完成单次余额和目录取证；按真实字段规划无资金采购适配。

Codex 在下次进入本地 Windows 环境时须读取 D:\Jianlian\_project_handoffs\CURRENT_HANDOFF.md、主线独立交接，追加本供应商独立记录及本 PR 的准确状态、测试与证据，不得覆盖其他供应商/支付/USDT/UI 已有成果。

## 2026-11-05 晚间 — 真实 GET 回执和离线诊断修复

用户提供的最新 Codex 回执：BALANCE_PASS_CNY，认证余额 GET 一次通过；Mall catalog GET 一次、HTTP 200，但读取正文失败，旧客户端只报 KUAJINGZY_TRANSPORT_FAILED。商品 ID、售价、库存、交付均 NOT_VERIFIED。密钥已加密保存，未购买、充值、部署、迁移或重试。原始 Windows 受保护报告在本轮连接器中未读取，不冒充独立复核。

本次仅补只读诊断：新增 HEADERS_UNREADABLE、CONTENT_TYPE_INVALID、BODY_READER_MISSING、BODY_READER_ACQUIRE_FAILED、BODY_STREAM_READ_FAILED、BODY_UTF8_INVALID、BODY_JSON_INVALID、RESPONSE_TOO_LARGE、UPSTREAM_CONTRACT_INVALID、REQUEST_TIMEOUT 等精确安全错误码；原有 TRANSPORT_FAILED 保留用于网络层。禁止输出原始错误 message、正文、密钥、Header 或堆栈。

只读探针新增 --catalog-only 模式：只调用一次 GET /api/open/v1/catalog/mall，输出 balanceGet=SKIPPED_PRIOR_PASS，不再访问已验证的余额。未知 CLI 参数在任何请求前拒绝。仍保持 12 秒超时、256 KiB 响应体上限、不重试、不存在下单/充值方法。若上限不足，必须以 RESPONSE_TOO_LARGE 失败收尾，不能擅自放宽。

下一次 Codex 唯一执行条件：核对本 PR HEAD 和 CI、本地保密报告；复用现有受保护的 API Key 注入来源，不能在聊天、GitHub、命令行历史、日志暴露。离线测试通过后，运行 node scripts/probe-kuajingzy-readonly.mjs --catalog-only 恰好一次。如果成功仅保留脱敏字段名/结构和商品适配性判断；如果失败仅记录 CATALOG_ERROR_STAGE 安全代码并 STOP。无真实下单、充值、余额复查、分页重复 GET、合并、部署、Production DB 写或供应商开关修改。更新总交接与 KuajingZy 独立交接；其他独立主线保持原样。

注意：模拟测试通过不代表真实 catalog 已验收。旧代码返回 TRANSPORT_FAILED，不能据此断言到底是哪一步出错；只有新的单次受控取证可以判定。
