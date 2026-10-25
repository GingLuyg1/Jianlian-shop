# Bitrefill上线前最后对接V1

2026-10-25。执行范围：公开商品GET、独立本地分支的小范围兼容修复、模拟/离线测试、现有商城/后台代码合同检查。**不代表真实采购或Production上线验收。**

## 基线与边界

- 远端main只读核对及fetch：`018b392bdcbbc56b970516e753a9fc2090ddc7a1`，即已合并PR78–81的版本；本地旧main落后，没有以其为基线。
- 本次独立分支：`codex/bitrefill-final-connect-v1`。
- 工作树：`D:\Jianlian\Jianlian-shop-bitrefill-final-connect-v1`。没有更新冻结RC1/P1/P2/P3或UI分支，没有commit/push/deploy。
- 复用已安装依赖，只在新工作树建立`node_modules`链接；没有安装依赖、复制.env或修改环境变量。
- API只使用`https://api.bitrefill.com/v2`的GET ping/products/search/实际已发现product ID。零重试，单次探针最多26请求及180秒预算；禁止重定向带凭据到其他主机。不读账户余额、历史invoice/order，不创建invoice、不付款、不采购。
- 没有访问Production数据库/服务器、执行任何SQL或DB9；没有接触PFX、云盘、备份和虚拟化环境。

## 1. 凭据、权限：GET成功不等于商业许可

当前进程`BITREFILL_API_KEY=SET`，Business API ID/Secret均NOT_SET。仅记录存在性，没有输出或保存值/Authorization。

实际Personal鉴权和商品GET成功；未使用POST探测写权限，也没有调用账户权限/余额接口。**转售许可、Business权限及商业目录访问仍未验证**，不能因HTTP200或个人Key存在而写PASS。

官方把平台/转售集成列为Business API用途，Business需要联系Bitrefill审核取得ID/Secret，并可能具有不同目录与定价；未替用户提交申请、发送邮件或编造商业条款。[API层级](https://docs.bitrefill.com/docs/api-overview)、[Business接入](https://docs.bitrefill.com/docs/Common%20Use%20Cases)。

## 2. 本轮确切缺陷及最小修复

第一轮3个GET中，ping、US第一页、第二页均HTTP200，但第二页解析失败。一次定点GET证明：`boost-mobile-usa`有**296**个套餐；单个套餐、基础字段及range均能解析，原200项上限导致整页INVALID_RESPONSE。

只做如下应用变更：

- `protocol.mjs`及对应`.d.mts`：套餐上限200→**512**，仍保留有限数组上限、512KiB响应上限、逐字段校验；不截断合法列表、不改变购买数量/币种/价格/成本判定。
- 两份既有测试保留超界拒绝，边界改为512/513；增加296合法及296中含无效price仍拒绝的断言。不是删断言或放宽成本/权限门禁。
- 新增GET-only核验脚本和两个离线回归测试：后续schema错误保留已完成鉴权证据；Applebee's餐厅不得被误认为Apple。新增脚本早期子串品牌误匹配已纠正，**未写任何绑定**。

新工作树受Git自动CRLF影响，最初两个测试出现换行相关失败。只将两份本地工作文件机械恢复为原Git blob的LF字节，逐字节比较原blob；没有改SQL、Git迁移内容或Daju代码，也没有改对应测试断言。最终Git差异不包含任何migration。

DB9原始SHA256仍为`90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0`。

## 3. 本轮实际商品结果

修复后探针21个GET全部HTTP200，US **551条唯一商品、12页、未触及截断上限**。加上初次失败定位共25个GET；未再次重复登录或尝试其他凭据。

当前Personal凭据可见的US目录和品牌搜索没有发现Apple US或Amazon US。其他国家Apple/Amazon有结果，但不能借用其国家、币种或面值给US SKU绑定。这里不是宣称全球不存在这两个商品，也不把历史猜测ID当作本次实际验证ID。

| 已实际GET的候选 | 币种/面值 | 本轮供货状态 |
|---|---|---|
| `steam-usa` | USD，固定5/20/30/50/100 | in_stock=true，数量未知 |
| `google-play-usa` | USD，固定5/10/20/40/60/80/100/120/140/160/180/200，另有range | in_stock=true，数量未知；可变面额采购仍关闭 |
| `sony-playstation-usa` | USD，固定50/100/150/200/250，另有range | in_stock=true，数量未知；可变面额采购仍关闭 |
| `netflix-usa` | USD，固定30/60 | in_stock=true，数量未知 |

原始套餐ID和原始catalogPrice已保存在脱敏公开商品证据内，但**catalogPrice的结算单位、手续费归属、报价有效期、商业折扣及可信采购成本均未核实**。不将面值或`product.currency`当成本币种；`currency`在官方商品文档中指面额币种。[商品字段](https://docs.bitrefill.com/docs/products)。

已有本地`gift-apple-us`十个SKU定义：2、3、4、5、10、15、20、25、50、100 USD，来源`lib/products/legacy-sku-backfill.mjs`。本次全部保持**未匹配/未启用**，未读Production SKU行、未运行backfill、未写supplier binding。不能把历史静态SKU定义当作当前数据库实际SKU清单。

## 4. 成本与资金门禁

`quote-core.mjs`只实现带来源、有效期和上限的**合成报价**；`paid-order-local.mjs`只接受FakeTransport、合成已支付账本和合成供应商余额。正式采购仍为编译期`REAL_BITREFILL_PURCHASE_ENABLED=false`；环境变量不能开启它。

真实报价接线尚未完成。需要供应商明确且可验的商品/套餐、结算币种、净成本、费用、有效期、可用性以及币种转换证据。当前本地财务模型要求同币种，不支持把客户CNY余额、USD面额和未知结算单位直接混算利润。缺来源、过期、币种不一致/无可信FX、超成本或利润不足都必须停止。

本轮**没有读取Bitrefill余额，也没有验证资金充足**。真实首次采购前的资金保障需另行授权，不把合成余额测试写成真实余额验收。

## 5. 订单/支付/采购/交付与后台合同

复用现有核心，未新建第二套采购/履约系统：

| 环节 | 当前实际状态 |
|---|---|
| 商城下单和余额支付 | 既有`pay_order_with_balance`服务端RPC及`runPostPaymentDelivery`；本轮只读代码核对和相关离线测试，没有真实或合成SQL扣账。 |
| 采购、幂等、状态恢复 | 既有P1/P2/P3/RC1 FakeTransport、RPC adapter、冻结参数/semantic hash、UNCERTAIN恢复和精确child映射的模块测试通过；没有真实invoice/child验证。 |
| 正式自动路由 | `supplier-router.ts`注册表仍**Daju-only**，Bitrefill只能由本地测试显式注入。没有默认启用生产Bitrefill worker。 |
| 私密交付 | 复用既有私密交付RPC及用户所有者API；`invoice complete`不等于child delivered，重复/错误child不自动交付。模拟测试通过，未访问Production卡密或真实HTTP会话。 |
| 客户UI | 已读取payment/fulfillment/item delivery状态，保留所有者交付API和no-store；没有浏览器直连Bitrefill，也不应向客户展示成本/密钥。没有本轮真实用户浏览器验收。 |
| 商品绑定UI | `AdminSupplierBindingSheet.tsx`使用Daju接口/类型/数字商品ID；`AdminProductSkuManager`绑定展示仍按Daju处理。**不支持直接配置Bitrefill字符串商品/套餐及可信成本**。 |
| 后台采购记录 | 通用只读运营列表读取`supplier_fulfillment_requests`，有安全状态/错误码；没有读取DB9 attempt/child/evidence表的Bitrefill专用面板。 |

因此`SIMULATED_PURCHASE_FLOW=PASS_OFFLINE_MODULES`仅指本轮模块级模拟链路，不是商城HTTP下单→真实SQL余额扣账→真实持久化事务→浏览器取卡完整E2E的新验收。既有完整PostgreSQL本地闭环历史成果保留、不重复运行；本轮未重新执行DB9或数据库审计。

UI/后台这些属于**尚未启用的功能接线范围**，不是可以不经授权顺手打开的缺陷。本轮不为了页面出现字段而放开成本、路由、权限或购买开关。

## 6. 本轮构建与测试

- TypeScript：PASS。
- 正常`npm run build`：PASS，完成77页生成及BuildID；没有改页面、字体或复制环境配置。存在可选`bufferutil`/`utf-8-validate`、Supabase动态依赖/Edge以及既有CSR告警，不冒称零告警。
- 定向ESLint及`git diff --check`：PASS；build本身按仓库原配置跳过lint，因此这里单独执行lint，不把Skipping linting当lint通过。
- 初次定向86/87：新checkout CRLF造成冻结字节校验失败；恢复准确Git LF字节后**87/87 PASS**。
- 初次Full Suite有两项失败：一个为新上限未同步的hardening超界fixture，另一个为历史Daju测试输入的checkout CRLF；分别同步真实新边界、恢复Git原始字节后最终**1504/1504 PASS，0失败**。
- 两项新核验回归已包含在1504总数。新失败为0，不把失败简单标为历史遗留，也未隐藏日志或删除安全断言。

本轮没有启动真实采购或数据库；没有重新跑备份、PFX、Hyper-V、40/40或110/110。

## 7. 证据与剩余最少操作

外部本地证据目录：`D:\Jianlian\_bitrefill_launch_connect_v1_20261025`。

- `shape-1792899581592.json`：一次定点公开结构证据，296个套餐，未存原始完整payload。
- `catalog-1792899680219.json`：21个实际成功GET及公开字段。**早期品牌子串匹配包含Applebee's，mapping部分作废，不用于绑定。**
- `catalog-corrected-offline.json`：基于同一公开数据离线剔除Applebee's，十个Apple目标均0匹配，newHttpRequests=0；保留源文件SHA256。没有冒称重新查询API。
- `full-suite-final.log`：1504/1504实际结果。

真正阻止首次真实采购：

1. **用户/供应商**：取得Business/转售许可及目标国家商品准入，确认Apple/Amazon US是否授权可售；凭据只能通过本机安全渠道配置，不发聊天。当前本机没有Business凭据，不推定供应商账号全局未获许可。
2. **供应商合同**：提供可验证采购成本/币种/费用/有效期和真实child关联字段契约；catalog价格或面额不能替代。不能为了验证而先发一笔未授权采购。
3. **另行开发授权**：在既有架构中接入已核验的真实报价/财务证据、默认关闭的生产编排和受权限控制的后台只读/绑定合同；不重写采购核心、不顺手启用自动采购。
4. **独立发布门禁**：已知DB9尚未在Production执行、应用未部署；这些事实继续阻挡正式持久化/发布，但本轮不重新审计或执行。之后还须单独授权受控小额canary及真实child身份验证；不得从本轮模拟PASS直接跳到购买。

建议下一步仅先完成第1、2项供应商确认；不重复准备密钥、备份或服务器。收到正式契约后，再明确授权第3项有界接线开发；真实采购、迁移、部署各自单独授权。

```makefile
BITREFILL_API_ACCESS=PASS_PERSONAL_GET_ONLY
RESELLER_PERMISSION=NOT_VERIFIED_BUSINESS_CREDENTIALS_NOT_SET
PRODUCT_ID_MAPPING=PARTIAL_four_US_candidates_Apple10_unmatched_no_bindings_written
SUPPLIER_COST_READY=no
PRODUCT_DISPLAY_READY=PARTIAL_generic_customer_contract_only
SIMULATED_PURCHASE_FLOW=PASS_OFFLINE_MODULES_NOT_HTTP_OR_FRESH_POSTGRES_E2E
ADMIN_INTEGRATION=PARTIAL_Daju_binding_and_generic_queue_only
BUILD_TEST=BUILD_TYPECHECK_LINT_PASS_FULL_1504_OF_1504
PRODUCTION_CHANGED=no
REAL_PURCHASE_EXECUTED=no
DB9_EXECUTED=no
BLOCKERS=Business_resale_permission;Apple_Amazon_US_entitlement;trusted_live_cost_and_FX;real_child_contract;closed_production_wiring_admin_integration;known_DB9_release_gate
NEXT_ACTION=obtain_Bitrefill_Business_permission_and_exact_cost_child_contract_then_authorize_scoped_default_closed_wiring
```

STOP。保持真实采购关闭，不提交、不推送、不改UI分支，不部署或迁移。
