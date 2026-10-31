项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# 后台 V2.5 首页接续与 Test 只读验收

TASK=JIANLIAN_ADMIN_DASHBOARD_V2_5_CONTINUE
日期：2026-10-31，Asia/Shanghai。
基线 main：9f0f99a1673e166ba7ae3fde25d1b380ae4657ae。
独立分支：codex/admin-dashboard-v25-continue-20261031。
独立源码树：D:/Jianlian/Jianlian-shop-admin-dashboard-v25-continue-20261031。
本地真实Test预览：http://127.0.0.1:3024/admin（loopback代理；后端3041）。

## 保留与范围

恢复原树22项已存在的V2.5候选，沿用认可的Clasy布局/Premium Glass、独立日期、运营卡片、产品统计与桌面/手机布局，不另设计首页。
不携带优惠券导航/营销草案，不修改后台其他页面、前台PR87、支付/余额/订单/供应商写逻辑、数据库或依赖。
共享AdminLayout/Sidebar/TopBar仅加data属性；首页CSS以marker限定，不替换已合并导航/权限/手机抽屉。
商品弹窗使用新DashboardDialog封装：保留认可的可选玻璃遮罩，同时让共享components/ui/dialog.tsx保持main原字节，避免与前台PR87争用。
两份既有统计SQL定义作为只读审阅/测试依赖文档保存于docs/sql-candidates；不是迁移，不自动执行。两个Test函数本轮已存在并返回200。

## 实际发现及最小修复

1. 经营统计模块Map永久缓存：改为15秒、最多32个结果，同查询在途复用；最后一个首页读者离开/身份变化/退出清理，旧请求不可回填清空后的缓存。不写localStorage。相同用户重复SIGNED_IN/Token刷新不再无意义失效。
2. 两个STABLE只读RPC使用GET；继续先requireApiAdmin再service-role、private/no-store、日期/分页/完整性校验。数据库读取限8秒。
3. GET空UUID参数不能发送字符串null：未选商品时省略p_product_id，使用已有函数默认null。修复商品统计503，真实列表、分页、趋势均200。
4. 客户端8秒将正常鉴权/开发冷编译算入期限，导致接口后来200但界面已超时：客户端期限30秒，服务端SQL读取仍8秒；不增加等待、不提前伪造就绪，失败显示清晰错误。
5. 原每管理员每接口6次/分钟不足以覆盖三组独立日期与分页，真实复现429：仅首页只读预算调至18次/分钟，仍有用户/接口分隔、1000bucket上限和429/Retry-After；未改共享支付/写限流。
6. 商品读effect只引用明确from/to，消除原range依赖警告。旧玻璃回归断言改为验证实际DashboardDialog实现并额外确认共享Dialog无dashboard专用样式，未删除/跳过测试。

## 数据来源与真实性

| 显示项 | 当前来源/口径 | 实际证据/限制 |
|---|---|---|
| 商城成交额、充值到账、创建订单、区间当前支付率、PV/UV、日趋势及渠道区间数 | Test admin_dashboard_analytics_v23；上海自然日、冻结人民币/实际支付/实际入账口径，完整序列校验 | 真实Test RPC与正常管理员API200；2026-07-15～08-11为28天、人民币177.70、创建15/当前已付10、充值0；10-02～10-31为30天、成交0、充值20、PV18/UV3 |
| 商品成交订单/销量/分页/单商品日趋势 | Test admin_product_dashboard_v25_snapshot 单语句快照 | 实际42商品；首页10行、列表15行；第2页200；单商品1行/30天200；不存在搜索0条200 |
| 用户/产品样本、运营待办、最近订单/充值、当前渠道配置 | 原有首页真实Test表/目录GET与payments/readiness；页面保持当前快照/样本标识 | 非合成HTTP；仍受既有RLS/管理员权限与原查询样本范围约束，不夸称全历史经营账本 |
| 系统状态 | 当前读取结果、readiness提供的结构事实 | 未测回调/审计/自动发货/对账运行仍显示未检测；RPC存在仅部分配置，不等于资金业务实测 |
| 商品曝光/点击/CTR/下单率/付款率、权威逐商品人民币分摊、历史每日用户序列 | 尚未接入 | 保持暂未接入/待核对及禁用排序/趋势，不用假0代替 |

本地页面没有使用Fixture替代真实Test HTTP，也没有伪造管理员、导出Cookie或复用登录Token。正常Chrome会话直接进入Test，不需重新登录。
但Test数据库本身包含历史人工测试/合成商品及订单样本，因此表内真读取不是实际生产经营、上游真实采购或真实资金E2E证据。未注入模拟经营数字，不向用户暗示生产收益。
原10/26六页验收直接复用，没有重新执行那套流程。

## 本轮定向验收

- Chrome真实CSS视口1440×900和390×900：已登录、实际首页/弹窗截图、无页面横向溢出；手机主内容可滚到底部。
- 三组日期控件独立从7/本日切到30天；相同查询有缓存/在途复用，最终日期与对应API一致。
- 商品列表15行、下一页、清空搜索恢复42商品、真实不存在搜索空态、销量排序及单商品30天趋势定向操作。
- 匿名/dashboard/analytics GET=401；没有关闭鉴权或通过service-role伪造浏览器身份。
- 加载状态沿用既有完整骨架/读取反馈；保留实际冷超时和429错误截图/响应及修复后的真实恢复证据。未以Fixture错误代替Test故障。
- 最终就绪采集中Console error/warning/pageError=0；另有1条fetch拒绝计数，旧观察器未留精确路径，不能称所有网络0失败；最终所需API均200，未持续Loading。此前实际503/429和冷超时证据保留，不能从历史累计计数抹掉。
- 定向25/25 PASS、0FAIL/0SKIP；TypeScript退出0；完整范围定向Lint退出0且0warning。没有重新跑全站测试或Build，不称当前完整CI已通过。

## 本地证据与预览安全

证据目录：D:/Jianlian/_admin_dashboard_v25_continue_20261031/
- test-rpc-dependencies.json（固定Test只读GET；仅依赖核实，不冒充浏览器鉴权）。
- browser-dates-0/1/2.json、browser-products-0/1.json、browser-empty-0.json、browser-product-trend-390.json、mobile-scroll-final.json等。
- dashboard-real-test-1440-final.png、dashboard-real-test-390-top.png、dashboard-real-test-390-bottom.png。
- dashboard-product-list-1440.png、dashboard-product-list-390.png、dashboard-product-empty-1440/390.png、dashboard-product-trend-390.png。
- dashboard-real-test-1440-top.png / ready.png及browser-before-cold-timeout-fix.json、browser-rate-limit-before-fix.json保留初始问题，文件名含ready不等于当时最终PASS；以后续final和JSON为准。
- targeted-tests-final.log、typecheck-final.log、lint-final.log。
- 运行器只读取已有Test配置原件，不复制/新建/修改.env。固定Test项目czuoivbfxzachiobdohw；禁止Production/外部支付/供应商访问与业务写入，仅允许正常Auth与已审阅两只读RPC GET。
- 3019前台未停；后台3024独立，不启动Worker。脚本/本地证据不提交，不将辅助进程当部署制品。
- 安全恢复：确认3024/3041均无所属运行进程后，在本工作树运行D:/Node.Js/node.exe --no-experimental-strip-types D:/Jianlian/_admin_dashboard_v25_continue_20261031/start-runtime.cjs；使用隐藏窗口，不改门禁/.env。

## 发布停点

仅准备独立本地提交、指定后台分支推送与Draft PR供用户视觉确认；不Merge，不部署Production，不执行SQL。
下一步仅用户确认V2.5最终效果/审阅Draft；Production数据库兼容、规模性能、移动真机、正式发布与回退是后续单独门禁，Test只读通过不自动批准上线。
前台397dcc2/PR87、原110项未提交修改、V2.5基准da560ad、安全RC675b9a1和其他工作树保持隔离。USDT扫描器与真实资金E2E PENDING不动。
