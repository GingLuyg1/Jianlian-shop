# Jianlian Shop — 数字账号选品与同链接多 SKU 方案（2026-11-06）

## 用户本轮确定的业务顺序

选品范围先为 **Apple ID、Telegram/TG、Threads、Instagram/INS、Outlook/Hotmail、Google/Gmail、Facebook、Steam**。先读取真实供应商目录形成候选清单，**由用户确认选哪些商品**，之后再创建新商品链接与 SKU。新链接**标题格式必须等用户单独确认**，不得擅自生成或上线。

Apple ID：**优先大橘（Daju）**。只有大橘确无相同有效 SKU、或确实没有可用库存且允许备选时，才评估跨境资源网；必须要求商品/地区/新老号/交付及安全属性完全一致。不能把“两个供应商都叫 Apple ID”视为可以互相自动替代；真实跨供应商自动回退需要单独的身份、成本、库存及交付合同验收。

其他七组：先用跨境资源网普通 API 文档支持的 `search` 关键词做定向只读候选调查，不猜分页参数，不假定品牌/商品存在。Steam 账号与 Steam 礼品卡不能混为同一类；非账号商品标记其他主线。

## 实际只读目录任务（已提供脚本，尚未真实运行）

GitHub `scripts/collect-account-product-shortlist.mjs`：
- 首次通过已有大橘 `GET /products?q=苹果` 查 Apple ID；只用已有 Daju client-core，不查询余额、不调用采购。
- 若没有**已观察库存>0且自动交付**的 Apple ID 大橘候选，则只读跨境资源网 `GET /api/open/v1/catalog/mall?search=Apple+ID`，作为**备选候选**而不是直接启用回退。
- 按顺序查询跨境资源网的 `Telegram`、`Threads`、`Instagram`、`Outlook`、`Gmail`、`Facebook`、`Steam`，恰好一条文档支持的 `search` 过滤 GET / 品牌。合计最多 9 次只读 GET（若大橘有适合的 Apple ID，则最多 8 次）。
- 必须从已有受保护环境加载 `DAJU_API_KEY` 和 `KUAJINGZY_API_KEY`，以及受保护的 **`JIANLIAN_SHORTLIST_OUTPUT` 新文件路径**。不在命令行正文或 GitHub、聊天粘贴 Key；输出新文件仅保存已脱敏的商品 ID、候选名称、展示价、库存快照、品牌/小组及有限供应商 SKU 标识，不保留描述、邮箱、原始响应、账号密码或卡密。安全文件权限要求 0600（Windows 本地还需 Codex 确认 ACL）。
- Daju 已有请求 10 秒超时、256KiB 返回体限制；KuajingZy 保持 12 秒超时、256KiB 限制；禁止重试、禁止余额查询、失败时立即停止整个任务，保存已有**部分结果**与错误安全代码。部分结果不得当成“没有这个供应商商品”的证明；真实字段缺失不能编造。
- 脚本只读，返回 `purchaseEnabled=false`、`productionChanged=false`。每个商品标记 `finalFeeInclusiveDebitVerified=false`、`stockAuthoritative=false`、`fulfillmentContractVerified=false`、`saleEnabled=false`，未验收不得转为可售或自动采购。
- 模拟测试在 `tests/unit/kuajingzy-account-shortlist.test.mjs`；只有 exact HEAD 的 CI 通过、本地已有安全加载器确认不会泄密、密钥确实可用时，才允许一次有界实际运行。执行回执仅公布品牌商品数量、脱敏错误代码和结果文件路径；准备给用户看的候选表经私有通道保留标题、报价、已核实与未核实标记。

**注意：** 英文搜索词不保证覆盖供应商所有中文命名商品；`count=0` 仅代表该次有限关键词没有命中。失败时不自动改关键词重试或加宽 body/time 上限。后续如要扩大覆盖范围，由 Codex提出额外最小查询方案。

## 类目、商品、SKU 三层建模：不重复建链接

1. 商品所在大类为数字账号，品牌如 Apple ID、Google/Gmail、Telegram 等为前台分类筛选维度（复用现有 `categories.sort_order`）。**新号/老号/地区/2FA/类型属于商品 SKU 选项，不单独创建三级类目或 URL。**
2. Apple ID：一个商品详情链接，SKU 覆盖新号/老号及已明确的国家或安全属性。每个 SKU 关联唯一供应商产品、规格和身份；有多供应商备选必须分别核实，不自动切换到未授权候选。
3. Google/Gmail：同一 Google 品牌入口**点击品牌显示全部所选 Google 商品**，首先按「业务分组」的 `groupSortOrder` 升序，再按组内 `product.sort_order` 升序，最后用稳定 ID 作平局顺序。组（如普通邮箱、教育/企业域名）是页面内筛选，不额外生成用户可见的商品三级类目链接。点击某分组只显示该组商品，并按该组的商品排序展示；返回「全部」恢复分组顺序。分组标签与顺序由用户选品确认后确定。
4. Google 新号/老号仍作为所选商品的 SKU，而不是必须分别建商品链接；但交付内容、邮箱类型或合同实质不同（如普通 Gmail 与教育/企业域名邮箱）必须按已核实的业务属性拆成不同商品，不可把不同交付合同强塞同一 SKU。
5. Telegram、Threads、Instagram、Outlook、Facebook、Steam 同样优先「品牌入口 → 商品链接 → SKU 选项」。若差异属于多个实质不同商品（交付方式、权属、服务期限），再经用户选择拆分链接。
6. 展示排序只能影响 UI，绝不能改变结算、库存、已支付订单冻结 SKU、供应商绑定或采购幂等。前台现有商品/分类 `sort_order` 与 `product_option_groups`、`product_option_values`、`product_skus` 可复用。现有后台类目编辑主要支持 1/2 级；Google 组内显示排序需独立 UI/后台核验，不在供应商 PR 中擅自修改 Production schema。
7. 所有待选商品是候选，不创建数据库记录、商品 URL、库存或发货规则。用户确认选品后再约定标题格式；标题不得由供应商长描述直接自动生成。

## 下一次交接与完成标准

- **唯一下一步：** 本地 Codex 先读取最新总交接和供应商交接，对这一批文档查询条件、凭据保护和只读测试进行 preflight；在受保护环境最多运行一次 shortlist 脚本，输出用户可审核的真实候选清单（或精确原因及部分清单）。
- 如果任一供应商接口失败：只报告已取得的候选和明确阻塞，STOP；不得为凑齐候选无限查、自动重试或盲目放宽超时。
- 提交人工选择用的候选表，字段至少为「平台/分组、供应商、真实商品名、商品 ID、规格 ID（若提供）、展示价格、库存快照、交付是否可验证、建议合并 SKU 组、状态」。价格未验证最终扣款则必须明显注明。
- 选品和新建链接标题由用户决策；未选的商品不入库，不补货、不采购、不启用销售。
- UI/后台分组与排序开发在**独立新 Draft PR** 中按确认的商品目录进行；不把 UI 与跨境资源网 #103 混合。
- 不涉及 Bitrefill #102、当前已部署 UI #104、支付、USDT、Production 迁移、任何实际采购/扣款。
