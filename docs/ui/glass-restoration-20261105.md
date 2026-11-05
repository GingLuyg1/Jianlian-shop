项目执行原则：能由 Codex 自动完成的操作一律交给 Codex；仅在输入私密口令、必要授权或确实无法自动完成时要求用户操作，避免重复确认、反复测试和耗时等待。

# UI 恢复与充值页精简，2026-11-05

## 当前最新：个人中心、支付渠道倾斜及三级轻量选中

根据用户最新参考，三级改为白色卡片、局部暖色高光、细边与柔和阴影；选中玻璃层1.004倍（取代旧1.01），保留右旋8度/图标选中1.12、名称不变色。价格改暖橙色、库存数字采用绿色胶囊，仅展示样式改变。高度84/72、二级93%/三级97%～100%与选中100%继续保留，按钮和wheel不叠加transform。

充值USDT输入占位改“请输入金额，最低 21 CNY”，支付宝/微信和USDT输入右侧均显示CNY，真实计算与限额合同不变。须知在线客服加有边框的轻玻璃按钮，仍打开原客服弹窗。前三个支付渠道用固定网格槽位承载轻倾斜按钮，最大rotateX±3°/rotateY±4°，光点随指针移动；requestAnimationFrame合并更新、不使用逐帧React状态，测量未变换父槽位避免反馈抖动。离开/取消/失焦清理；禁用、触屏、减少动态效果无倾斜。没有新增依赖或改渠道可用性。

推广空状态的变色来自通用tbody tr:hover覆盖空占位行，现只对非空数据表开启悬停背景；空表填满剩余高度，保持一致背景。实际Chrome空表前后同为透明、表格/内容高度496px相同；合成有记录行仍有正常悬停反馈。

主导航桌面/手机在我的订单下方加入个人中心（原/account），顶部菜单同名。AccountShell旧“我的账户”区换成身份资料卡、邮箱验证展示、可复制的完整本人邮箱、简短说明的设置导航；沿用现有邮箱/验证状态，不增加鉴权请求或更改认证流程。会员权益/API未提供功能继续暂未开放，无虚构VIP或授权状态。账号资料/个人资料/安全/隐私/API原路由和业务保留，内容加载确认滑块仍保留；子路由主导航归属个人中心，订单页面不重复激活。右侧标题为18px账号资料，没有新增巨大个人中心Banner。手机使用紧凑身份卡和横向导航。

TypeScript、定向Lint（3项既有img建议）、28项相关测试、正式Build PASS（既有可选ws依赖警告）。Chrome1440/390：个人中心位置/所有设置入口、快速连点最后选择、移动菜单、无横向溢出、三级选中、输入CNY/USDT占位、客服弹窗均通过；支付倾斜实测相反角度±1.8°/±2.8°，网格占位不变，离开/禁用/减少动态效果及真实触屏上下文不倾斜。所有浏览器数据为隔离合成数据，无真实登录、外部请求或业务写请求。

证据replica/PERSONAL_TILT_RESULTS.json、PERSONAL_EXTRA_RESULTS.json、personal-center-1440/390.png、personal-tilt-product-1440.png、personal-tilt-recharge-1440/390.png、promotion-empty-before/after.png；personal-tilt-tests.log和personal-tilt-build.log。复制版http://127.0.0.1:3027/account及/preview保持运行。尚待用户视觉确认，未合并或部署。

## 最新追加：93%/97%、须知等宽两行与商品选中反馈

本次最新要求覆盖下文：二级93%～100%、三级97%～100%，选中100%。三级实际卡片桌面86→84px，手机74→72px，加载卡片同步72/84px并协调内边距，间距不变。图标仍顺时针8度；选中时暖色阴影增强、玻璃背景放大1.01、图标1.12。新增data-selected复用既有selectedProductId，不改点击/请求/路由；按钮与wheel本体不加transform。减少动态效果关闭这些放大，名称颜色保持。

充值备注输入maxLength100、计数/placeholder100，并截断超长输入；仅前端输入约束，不改API/数据库合同。删除用户指定的创建单前4位USDT说明段；创建后的真实付款/记录精确金额说明保留。充值须知改四个等宽块，精简文案但保留关闭代理/二维码超限重取、付款后等1分钟、付款截图+用户名、2000限额、USDT不限和手续费含义。1440px实测每块265.5px、两段各20px，全部正文两行；手机自然排版。

本地复制版保留/preview多页入口。为用户观看选中动画，Git外next.tsx仅在商品列表点击结算链接时停留在原列表，实际页面setSelectedProductId仍执行；源码正式路由仍正常跳详情，没有加等待。复制版商品只作合成视觉展示，不执行结算/真实业务。

TypeScript、定向Lint无错误（4项既有img建议）、25项相关测试、最终Build通过。Chrome实测二级0.93～1/三级0.97～1、选中外层1.0000/按钮transform none、玻璃1.01/图标约1.12、字体同色；reduced-motion下不放大；1440/390无溢出，备注130字输入截为100，USDT指定提示消失，无页面异常/外部或写请求。证据replica/SELECTION_NOTICE_RESULTS.json、selection-hover/pressed/selected-1440.png、notice-four-cards-1440/390.png、selection-mobile-390.png；selection-notices-tests-final.log、selection-notices-build-final.log。仍为隔离合成数据，不是已登录真实Test。

## 当前最新：右旋、92%/90%及多页面复制版

用户本次要求覆盖以下历史值：三级图标顺时针/向右8度；二级wheel最小0.92、三级最小0.90，上限/选中均1。顶部登录、注册、余额、公告改8px圆角，其余尺寸/间距保持。共享算法及hook不分叉。

充值页按用户要求删除“当前渠道实际费率与本页展示要求不同……”展示段和仅用于该段的两个展示变量；实际费用/汇率/应付/到账计算、渠道启用判断、创建单API不变。付款说明采用用户新两句，桌面第一项占两个栅格单元，实际1440px两句各20px单行、总两行；手机自然换行，不裁字或强制单行。

复制版/preview提供14个页面入口，复用实际首页、分类、充值、账户概览/资料/安全/隐私/API、订单、推广、登录/注册、教程和FAQ组件。默认演示账户demo@example.test和启用的合成渠道；?guest=1可看充值未登录状态。身份、余额、渠道和记录均由Git外隔离辅助层合成，不使用真实Cookie/凭据，不启用真实渠道。表单捕获/提交按钮拦截和HTTP405双层禁止写入；CSP仅本机连接。启用状态仅用于展示正常UI，不能作为真实Test或Production渠道开放证据。

本地入口http://127.0.0.1:3027/preview；右下角页面入口也可切换。辅助文件replica/entry.tsx、client.ts、fixtures.cjs、next.tsx、server.cjs继续保留在Git外，不纳入产品源码。

TypeScript、定向Lint无错误（1项既有img建议）、15项wheel/预取/布局及10项充值相关测试（共25）PASS；Build PASS。Chrome15个桌面路由（含入口）/8个手机路由无横向溢出、页面异常、外部或写请求。三级实际角度+7.999999度，二级0.92～1、三级0.90～1；顶部8px。正常合成渠道下100元示例约3元外部费/103元应付/100元到账，21元USDT示例2.916667币/21元到账，只有界面计算，无创建单或付款。证据replica/PAGES_BROWSER_RESULTS.json、CURRENT_BROWSER_RESULTS.json、NORMAL_RECHARGE_RESULTS.json、pages-*.png和normal-recharge-*.png；preview-pages-tests.log、recharge-preview-tests.log、preview-pages-build.log。

## 最新微调：左转图标、三栏再分配、独立缩放下限

用户最新修正覆盖下文旧值：三级悬停图标改为逆时针/向左8度（scale1.08不变），名称不变色、暖色玻璃效果保留。一级导航251→248px，主区域offset271→268px；二级240→243px，因此三级1440px桌面下仍为881px且起点x543不变；原16px gap不变。顶部登录/注册/余额/公告独立设12px圆角，其他内容框保持上次26px/18px分层。

共享wheel计算与hook保留，只支持每栏传入缩放下限：二级0.95、三级默认0.98，上限及选中项均1。选中、点击居中、请求竞态与旧商品禁用逻辑不变；短列表/手机/减少动态效果仍为自然100%。新增独立下限连续性/选中项回归检查，没有复制两套算法。

TypeScript、定向Lint（3项既有img建议）、15项相关测试、Build PASS。Chrome实测图标矩阵角度-7.999999度，二级0.95～1、三级0.98～1，含连续值及反向滚动；选中二级1.0000，顶部4项实际12px，三栏尺寸与间距通过，1440/390无溢出或页面异常/外部/写请求。证据replica/SPLIT_BROWSER_RESULTS.json、SPLIT_LAYOUT_RESULTS.json、split-*.png，split-wheel-tests.log和split-wheel-build.log。当前复制版仍http://127.0.0.1:3027/products/digital-accounts，明确合成演示数据，不是真实Test验收。

## 当前追加验收版本：圆角与90%～100%滚动

按用户最新要求，覆盖下文先前98%下限：共享WHEEL_CONFIG.minScale现为0.90、maxScale为1。二级和三级继续用同一计算、滚动位置与点击居中机制，选中项100%，不需滚动的短列表/手机及减少动态效果保持自然100%。三级图标保留顺时针8度、1.08倍；暖橙细条及阴影、名称不变色，未向一二级增加此增强。

前台PublicLayout标记下统一26px外面板、18px内卡片，小控件采用14px基础圆角，胶囊徽标/圆形保持。账户中心、充值Tab及订单弹窗的专用玻璃样式同步协调；客服等Radix弹窗在前台路由下采用26px，侧边Sheet边缘不改。该规则不应用于后台，未调整padding、gap、字段或业务逻辑。

桌面一级导航从246px至251px，main offset从266px至271px，二级240px不变。浏览器实测三级外框从886px至881px，栏间距保持16px。品牌与首页间及公告下方分隔线删除。其他前台内容随可用宽度自然收缩5px，原最大宽度/间距保留，手机不强制桌面宽度。

TypeScript、定向Lint（1项既有img建议）、14项wheel/预取/布局回归、Build PASS。Chrome1440/390分类、首页、充值及客服弹窗无溢出；20项二三级列表顶部/中间/底部/反向滚动实际scale范围0.90～1.00，含连续中间值，三级图标实际顺时针7.999999度、名称颜色不变。证据replica/ROUNDED_BROWSER_RESULTS.json、ROUNDED_LAYOUT_RESULTS.json、rounded-*.png；日志rounded-wheel-tests.log、rounded-wheel-build.log。预览仍http://127.0.0.1:3027/products/digital-accounts，为明确隔离合成数据，未连接真实Test/Production。

以下为本轮各历史阶段说明，和当前版冲突时以上述最新追加要求为准。

基于 main f415d5d22aa632fd4e43d9457e79dca8d594c56e，独立分支 codex/ui-glass-restore-20261105。用户授权本轮提交、Push、独立 PR；不合并或部署。PR103 的供应商只读接口成果不纳入本分支。

- 后台首页复用 c1f44a8 的 V2.5 Premium Glass CSS，接入现有首页 DOM；恢复磨砂背景、柔和圆角卡片、4+3 指标布局及首页专属 shell 材质。保留当前 main 查询、指标聚合、权限、状态和交互；并非把旧数据组件或未发布 RPC 覆盖到 main。
- 前台导航参考用户图3，采用20px外围留白、246px宽圆角悬浮内容框，品牌区固定、导航内部滚动；继续使用原滑块、预加载和路由确认逻辑。保留 Jianlian 品牌和暖橙色。
- 充值页删除金额下方冗长平台费用段及支付宝/微信渠道卡副文案，费用汇总和实时计算保持；按用户文案替换付款说明/到账异常。
- USDT 已有人民币输入合同，本轮加入前端21元下限并同时保留后端实时最低币种金额校验；接口、DB、渠道配置、汇率换算和入账合同不变。它不是服务端全入口21元限额变更，其他API客户端仍受现有后端规则约束。
- 删除创建充值单前的地址/合约/网络/汇率大块展示；仍读取实时汇率生成预计USDT，失败保留局部提示。创建后的付款页、充值记录、精确应付USDT、二维码和到账规则不改。

## 验证

TypeScript PASS，定向Next Lint无错误（3项既有图片优化建议），正式Build PASS。6个相关suite合计30/30 PASS，包含独立旧业务前缀摘要校验，不改测试Hash或删除测试。

本地证据 D:/Jianlian/_ui_glass_restore_20261105/：build.log、BROWSER_FIXTURE_RESULTS.json、admin/recharge-FIXTURE-1440.png、admin/recharge-FIXTURE-390.png。使用实际页面组件静态渲染和隔离合成数据，Chrome1440/390无横向溢出；20元USDT提交禁用，21元（合成汇率6.6、渠道最低1USDT）可提交。没有触发POST或真实登录，不把Fixture称为真实Test/Production验收。

界面仍需用户通过PR或部署后的正常管理员登录确认。服务器、Production、数据库、Daju、Bitrefill、USDT扫描器均未操作。

## 后续视觉接续

导航已按资源中心、帮助中心、我的分组，首页独立保留。一级导航采用浅橙玻璃悬停及按压反馈。

最新用户修正覆盖之前蓝色方案：新参考动效只用于三级商品；二级和一级不增加细条或图标旋转，保留原导航反馈。三级采用暖橙色3px边缘条，自中点上下展开/离开收回，配浅奶油玻璃高光和柔和阴影；图标放大1.08倍、顺时针（向右）旋转8度。取消中部检测与名称变色，名称始终保持原深色；已删除这项撤销功能专用的指针处理文件及其测试，其余回归测试不改。

外层wheel和按钮本体不加变换；二级滑块、点击居中、98%～100%共享算法及商品可操作保护保持。TypeScript、定向Lint无错误（3项既有图片建议）、正式Build PASS；wheel、分类并行读取和预取共13项定向测试PASS。实际Chrome读取图标矩阵为顺时针7.999999度、scale1.080000，标题前后颜色同为rgb(51,65,85)，细条rgb(223,115,52)。20项二级及20项三级列表在顶部/中间/底部/反向滚动实际scale均在0.98～1.00，包含连续中间值；二级没有新细条或图标变换。

本地完整交互复制版：http://127.0.0.1:3027/products/digital-accounts 。复用实际PublicLayout、Sidebar、分类和商品列表、首页及充值组件；仅路由和数据读取由隔离辅助层提供。商品为明确标记的合成数据，来宾状态，禁止非GET/HEAD请求、CSP禁止外部连接，不代表真实Test登录或付款验收。浏览器验证分类点击实际更新商品/URL，首页与充值导航可用、reduced-motion、1440px及390px无溢出、无页面异常/外部请求/写请求。

预览辅助文件和证据：D:/Jianlian/_ui_glass_restore_20261105/replica/（server.cjs、entry.tsx、next.tsx、client.ts、verify.cjs、BROWSER_RESULTS.json、desktop-warm-hover-1440.png、desktop-full-replica-1440.png、mobile-full-replica-390.png）。辅助层仅在Git外，不替换业务源码或环境文件。旧3024静态演示为历史方案，以3027为当前入口。
