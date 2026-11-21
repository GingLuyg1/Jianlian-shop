项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# 跨境资源网 V1：离线基础与真实接线边界

本提交继续 Draft PR103，未合并、未部署、没有注册生产供应商或真实采购方法。本轮真实 API 请求数为0；没有读取DPAPI密钥或余额。此前账号API已审批、Key已受保护配置，不再沿用原PR描述“未申请”。

## 已有真实证据及无法证明的事项

本地 `_kuajingzy_catalog_filtered_20261105/TRANSPORT_RECEIPT.json`：2026-11-05T15:27:43.900Z至15:27:56.567Z，一次`search=礼品卡`请求在Response返回前超时，HTTP状态null、正文0字节、observerError=false；不能推定DNS、TCP、TLS、代理、供应商处理时间分别是多少。上次全目录超过256KiB是另一请求，不能混用其根因。此前余额CNY通过直接复用。

上轮关机随后被用户明确取消，SHUTDOWN_CANCELLED.json记录helperStopped=true；不能延续旧评论“主机正在关闭”作为当前事实。本轮用户另行授权完成后正常关机。

## 阶段诊断

真实只读客户端新增可选同步`onDiagnostics`，每次请求完成或失败仅发出一个冻结对象：序号、固定操作分类、相对单调毫秒、已读字节数、安全HTTP状态、失败code与stage；不含URL/query、Key、headers、正文或异常message。CLI成功JSON包含diagnostics；失败保留原`PROBE_ERROR`行，另加`PROBE_DIAGNOSTICS` JSON行。下一轮外部保护加载器须解析这个新格式，不能继续用旧“stderr仅一行”的正则吞掉诊断；本轮不运行真实加载器。

`requestStartedMs=0`；`responseHeadersMs`表示fetch返回时；`bodyStartedMs`表示第一块返回时；`bodyEndedMs`表示stream done；未发生的阶段为null。`BEFORE_RESPONSE_HEADERS`、`RESPONSE_HEADERS`、`WAITING_BODY`、`READING_BODY`、`BODY_COMPLETE`、`VALIDATING_ENVELOPE`、`COMPLETE`定位可观测边界。`outcome=PASS`只证明HTTP/envelope读取，后续catalog/domain/item业务schema仍可拒绝。

DNS/TCP/TLS为NOT_MEASURED；供应商处理与网络等待不可分离。即便知道TTFB，也不能扣除未知网络时间伪造供应商耗时。默认12000ms、262144字节、无重试及只读白名单保持。未测连接底层细分，也未延长超时。

## 目录标准化与SKU候选

`catalog-mapping.mjs`只识别文档示例中`data.domain=mall/items`和`id/name/categoryId/categoryName/platform/unitPrice/prices`。`description`不复制到DTO。金额只作展示观察；`prices.CNY`不能升格成含费可锁定采购成本。

额外规格、币种、库存、交付字段必须通过显式fieldMap登记；仅保留字段名、类型、存在性及严格限定的观察标量（非负整数/布尔库存、三字母币种、受限规格标识、PIN/code等交付标签），其余值null且contractVerified=false，不猜测供应商实际字段和值。documented_example、synthetic、authenticated_catalog分别保留来源；任何来源均automaticSaleAllowed=false。缺身份、重复ID、错误schema、超256KiB拒绝；未知敏感payload不透传。

SKU候选校验本地product/SKU所属关系、精确供应商ID，并拒绝重复本地SKU；仅生成既有`supplier_binding_candidate`元数据补丁，绝不修改正式supplier字段、库存、商品状态、订单冻结绑定或Daju。此处没有数据库保存接口/唯一约束落地，不把候选哈希当持久化唯一性证明。

## 采购保护：纯内部DTO，绝非供应商请求合同

`offline-purchase-policy.mjs`不含fetch、环境凭据、SQL、store或submit方法。输入quote/observed均内部合成DTO，字段如specificationKey、totalIncludingFees、totalDebitCny、status=delivered不是本轮已验收的上游字段。所有结果canSubmit=false。

- CNY字符串转BigInt，最多四位小数；禁止浮点金额、负数/指数及过多精度。完整含费成本和库存必须明确为权威；报价身份/数量/规格及有效期匹配才允许继续离线模拟。
- 单笔上限、累计spent+reserved+cost、余额reserved+cost分别检查；销售净收入扣除销售费用和供应商成本后按显式minimumMarginBps校验。没有擅自选择10%加价或15%毛利，没有把展示价变成成本。
- 复用`buildSupplierPurchaseIdentity`固定provider/orderItem/request/attempt/product/specification/quantity/CNY最高成本的语义哈希；相同逻辑订单requestId稳定，禁止为了重试换key；变更哈希须人工复核。
- 复用`classifySupplierSubmitBoundary`：可能发出/未知状态只QUERY_ONLY或MANUAL_REVIEW；明确未提交也仅REVALIDATE_ONLY，没有允许POST的结果。暂停和紧急停止拒绝。
- 交付只核对内部身份、状态、准确数量和实扣<=冻结上限；未权威GET/无私密存储/已交付/费用未知都拒绝。输出不带PIN，不存储卡密；仅返回需既有私密事务消费的资格判断，不宣称真实交付完成。

## 已有能力复用与持久化设计（未执行DDL）

|能力|仓库现有事实|本轮边界/缺口|
|---|---|---|
|统一路由/履约|core/supplier-router-core、fulfillment-core具备claim/query/outcome|未注册kuajingzy，既有供应商不变|
|SKU候选|core/admin-sku-binding已有候选slot及CAS审计|只生成补丁，不调用保存或开放前台|
|本地库存优先|既有商城库存/订单发货机制|复用其成功路径，不伪造库存|
|持久化采购|DB9逻辑key、attempt/unit/external-order唯一性与CAS；Bitrefill store已有提交前落盘|实际adapter硬编码bitrefill；不能通过替换supplier字符串宣称支持新供应商|
|私密交付|Daju store/record_supplier_fulfillment_outcome和DB9私有交付事务|DB9 deliver_child查询含bitrefill专用过滤；未修改、调用或假称跨境资源网已可用|
|对账/未知结果|现有QUERY与人工异常处理|复用，采购POST合同及权威GET身份字段仍缺真实验收|

未来受控接线须在**同一现有逻辑采购/订单事务边界**内完成：校验已付款订单及冻结SKU→锁定预算→唯一(provider,logical_request_key)领取→保存语义哈希/上限/幂等key→CAS到SUBMITTING并提交→才允许外部POST。并发第二个请求读旧attempt，不重新提交。外部结果不明保留reserved及原单定位，不能因超时释放额度后换key再买；无可靠GET定位则人工处理。

供应商返回需经精确订单/商品/规格/数量/币种和实扣审计；私密交付内容与deliveryId、orderItem/unit以及已交付状态同事务写入，重复查询只返回已有交付。取消/退款/缺货由现有异常层处理；未确认没有扣款前不能自动释放预算或退款成功。业务失败和网络不确定不能混为可重购。

实际表/RPC当前兼容性需后续单独审阅，迁移须备份、授权和隔离验收。本轮没有设计第二套表或执行DDL。采购/卡密/成本不进入公开SKU metadata；仅服务端可信访问，权限与RLS按[Supabase官方安全原则](https://supabase.com/docs/guides/database/postgres/row-level-security)核对。没有通过公网角色访问采购表，也没有在本轮数据库运行测试来冒充落地。

## 验证与继续条件

离线测试覆盖阶段超时、连接失败、读取失败、大小限制、畸形/缺失目录、SKU漂移、精确预算/毛利、缺货、未知提交、重复领取/交付和秘密不泄露。统一履约测试只使用已有core加内存CAS测试替身，**不是**真实DB并发或供应商E2E。真实付款/采购E2E不重跑。

只有下一次另行获准的有界筛选查询通过后才能映射真实商品；随后仍需取得精确采购POST参数、可执行最高实扣、权威GET状态/身份/私密交付字段、转售及单笔累计资金授权与实际持久化接线证据。缺任何一项均不开放销售和采购。本轮没有发真实API、解锁Key、查余额、迁移、合并、部署或修改Production。
