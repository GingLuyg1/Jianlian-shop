/** Presentation only: never use these labels as API/filter/database values. */
const businessLabels: Record<string, string> = {
  account_recharge: '账户充值', recharge: '账户充值', order_payment: '订单支付', order: '商品订单',
  payment: '支付', account: '账户', login: '登录', inventory: '库存',
  delivery: '订单发货',
  admin_adjustment: '管理员调整余额', refund: '退款', promotion: '活动赠送', system: '系统调整',
};
const statusLabels: Record<string, string> = {
  pending: '等待处理', processing: '处理中', completed: '已完成', succeeded: '已完成', paid: '已付款',
  failed: '失败', cancelled: '已取消', expired: '已过期', closed: '已关闭', active: '已启用',
  inactive: '未启用', disabled: '已停用', enabled: '已启用', draft: '草稿', sold_out: '已售罄',
  pending_payment: '等待付款', unpaid: '未付款', waiting_payment: '等待付款', submitted: '已提交',
  reviewing: '审核中', approved: '已批准', rejected: '已驳回', refunded: '已退款',
  partially_refunded: '部分退款', fulfilling: '正在交付', fulfilled: '已交付',
  manual_review: '需要人工核查', needs_input: '需要补充信息', uncertain: '状态不确定，需要核查',
  retryable_failed: '失败，可再次尝试', permanent_failed: '失败，需要人工检查',
  matched: '核对一致', mismatched: '核对不一致', query_failed: '查询失败', not_found: '未找到',
  success: '成功', valid: '验证通过', invalid: '验证失败', skipped: '已跳过', duplicate: '重复记录',
  available: '可用', reserved: '已预留', sold: '已售出', void: '已作废', imported: '已导入',
  open: '待处理', resolved: '已解决', running: '正在运行', ready: '已就绪', configured: '已配置', not_configured: '未配置',
  superseded: '已替代',
  connected: '已连接', disconnected: '未连接', partial: '部分可用', unavailable: '暂不可用',
  queued: '等待执行', sent: '已发送', delivered: '已送达', bounced: '投递退回', suppressed: '已停止发送',
  normal: '正常', watch: '需要关注', high_risk: '高风险', blocked: '已拦截', restricted: '受限', suspended: '已暂停',
  pass: '通过', warning: '需要注意', error: '异常', critical: '严重异常', info: '提示',
  attention: '需要注意', no_source: '没有供货来源', denied: '已拒绝',
  published: '已发布', archived: '已归档', investigating: '正在调查', ignored: '已忽略',
  not_applicable: '不适用', underpaid: '付款不足', overpaid: '付款超额',
  verified: '验证通过', accepted: '已接受', ok: '正常', success_idempotent: '此前已完成，无需重复处理',
  executed: '已执行', pending_confirmation: '等待确认', implemented: '已实现',
  high: '高风险', medium: '中风险', low: '低风险',
  warn: '警告', requested: '已申请', created: '已创建', pending_review: '待审核',
  not_started: '未开始', in_progress: '进行中', approved_pending: '已批准待执行',
  partially_fulfilled: '部分交付', deleted: '已删除', unused: '未使用', revoked: '已吊销',
  healthy: '健康', degraded: '降级', unhealthy: '异常', unknown: '未知',
  paused: '已暂停', completed_with_warnings: '已完成（含警告）',
  checkout: '结算页确认', missing: '历史缺失', read: '已读', unread: '未读',
  monitoring: '观察中',
  retrying: '重试中', under_review: '人工复核中', waiting_confirm: '等待确认',
  confirming: '链上确认中', completing: '入账完成中', payment_failed: '支付失败',
  exhausted: '已耗尽', verifying: '核验中', compatibility: '兼容脚本',
  delivered_partial: '部分发货', shipping: '物流发货', physical: '实物快递',
  manual_delivery: '人工交付', card_key: '卡密', redeem_code: '兑换码',
  account_password: '账号密码', plain_text: '纯文本',
  data_export: '个人数据导出', account_deletion: '账号注销申请',
  terms_of_service: '用户服务协议', privacy_policy: '隐私政策',
  refund_policy: '退款与售后政策', digital_delivery_policy: '数字商品交付说明',
  purchase_notice: '购买须知',
  global_top: '全站顶部公告栏', home: '首页横幅', account: '个人中心',
  kuajingzy: '跨境资源网', bitrefill: 'Bitrefill', daju: '大橘供应商',
  alipay: '支付宝', wechat: '微信支付', balance: '余额支付',
  usdt_bep20: 'USDT (BEP20)', usdt_trc20: 'USDT (TRC20)',
  snpay: 'SNPAY 聚合支付', liuhaoyi: '六合一支付',
  resend: 'Resend 邮件服务', postmark: 'Postmark 邮件服务', custom: '自定义邮件服务',
  order_delivered: '订单发货通知', order_logistics_shipped: '物流快递发货通知',
  order_paid: '订单支付成功通知', recharge_success: '账户充值到账通知',
  refund_approved: '退款通过通知', refund_rejected: '退款驳回通知',
  refund_completed: '退款完成通知', admin_system_alert: '管理员系统告警',
  auth_verify_code: '邮箱验证码', password_reset: '找回密码验证',
  ticket_replied: '工单回复通知',
  duplicate_payment: '重复付款', item_unavailable: '商品缺货/不可用',
  delivery_failed: '交付失败', customer_request: '用户主动申请',
  quality_issue: '商品异常/不可用', wrong_order: '拍错/重复下单', other: '其他原因',
  orders: '订单模块', payments: '支付模块', recharges: '充值模块',
  refunds: '退款模块', users: '用户模块', products: '商品模块',
  inventory: '库存模块', system: '系统模块', settings: '设置模块',
  order_payment_completion: '订单支付完成补偿',
  recharge_credit_completion: '充值余额入账补偿',
  order_delivery_dispatch: '订单发货派发补偿',
  inventory_release: '库存预留释放补偿',
  refund_wallet_credit: '退款退回余额补偿',
  resolve_payment_reconciliation: '处理支付对账异常',
  ship_logistics_order: '物流订单录入单号发货',
  max_auto_overpayment_ratio: '自动超额入账最大比例',
  max_auto_overpayment_usdt: '自动超额入账最大 USDT 上限',
};
const supplierLabels: Record<string, string> = {
  pending: '等待采购', processing: '正在采购', retryable_failed: '采购失败，可再次尝试',
  permanent_failed: '采购失败，需要人工检查', completed: '已完成', uncertain: '状态不确定，需要核查',
  needs_input: '需要补充信息', PENDING: '等待采购', PURCHASING: '正在采购', RECONCILIATION: '正在核查采购结果',
  FULFILLED: '已完成', UNCERTAIN: '状态不确定，需要核查', NEEDS_INPUT: '需要补充信息',
};
const workerLabels: Record<string, string> = {
  finished: '已正常完成', disabled: '任务未启用', execute_not_enabled: '未开启执行',
  no_progress: '本次没有处理进展', partial_failure: '部分处理失败', unavailable: '暂未获取',
};
const detailLabels: Record<string, string> = {
  provider: '支付平台自动核验', manual: '人工审核', auto: '自动处理', automatic: '自动处理',
  admin: '管理员', user: '用户', system: '系统', super_admin: '超级管理员',
  approve: '审核通过', start_review: '开始审核', request_more_proof: '要求补充凭证',
  reject: '驳回', cancel: '取消', retry_credit: '重新处理入账', approve_late_payment: '核验过期付款并入账',
  approval_intent: '已记录处理意图', completion: '处理完成',
  snpay_late_payment_manual_v1: '支付平台过期付款人工核验',
  underpayment_credited_to_wallet: '不足额付款已转入余额',
  update_payment_channel_config: '修改支付渠道配置', recharge_approve_late_payment: '核验过期充值并入账',
  update_product: '修改商品', create_product: '创建商品', delete_product: '删除商品',
  update_product_sku: '修改商品规格', create_product_sku: '创建商品规格', delete_product_sku: '删除商品规格',
  bulk_sku_status: '批量修改商品规格状态', bulk_sku_activate: '批量上架商品规格',
  update_user: '修改用户资料', adjust_user_balance: '管理员调整余额',
  approve_refund: '批准退款', reject_refund: '拒绝退款', cancel_order: '取消订单',
  update_order_status: '修改订单状态', fulfill_order: '订单发货', manual_fulfill_order: '人工发货',
  retry_supplier_fulfillment: '重试供应商采购', sync_supplier_order: '同步供应商订单',
  bind_supplier: '绑定供应商', unbind_supplier: '解绑供应商',
  bind_kuajingzy_supplier: '绑定跨境资源网供应商', unbind_kuajingzy_supplier: '解绑跨境资源网供应商',
  bind_daju_supplier: '绑定大橘供应商', unbind_daju_supplier: '解绑大橘供应商',
  bind_bitrefill_supplier: '绑定 Bitrefill 供应商', unbind_bitrefill_supplier: '解绑 Bitrefill 供应商',
  update_sku_metadata: '修改规格配置与成本',
  create_category: '创建分类', update_category: '修改分类', delete_category: '删除分类',
  reorder_categories: '调整分类排序', reorder_products: '调整商品排序',
  import_inventory: '导入数字库存', disable_inventory_item: '停用库存卡密', restore_inventory_item: '恢复库存卡密',
  void_inventory_item: '作废库存卡密', delete_inventory_batch: '删除库存批次',
  update_settings: '修改系统设置', update_recharge_rate: '设置每日充值汇率',
  create_recharge_rate: '创建每日充值汇率',
  recharge_approve: '审核通过充值', recharge_reject: '驳回充值申请', recharge_cancel: '取消充值单',
  recharge_start_review: '开始审核充值', recharge_request_more_proof: '要求补充充值凭证',
  recharge_retry_credit: '重试充值入账',
  refund_approve_balance: '批准余额退款', refund_mark_processing: '标记退款处理中',
  refund_complete_external: '登记外部退款完成', refund_reject: '驳回退款申请',
  refund_cancel: '取消退款申请', refund_fail: '标记退款失败',
  bep20_underpayment_settle: 'BEP20 欠额转余额结算',
  upload_media: '上传媒体资源', media_archive: '归档媒体资源', media_delete: '删除媒体资源',
  media_mark_unused: '标记媒体未使用', media_update: '更新媒体资源',
  reply_ticket: '回复客服工单', update_ticket_status: '修改工单状态', toggle_ticket_flag: '切换工单标记',
  approve_agent_application: '通过代理 API 申请', reject_agent_application: '驳回代理 API 申请',
  revoke_agent_api_key: '吊销代理 API 密钥', add_agent_ip_whitelist: '添加代理 IP 白名单',
  delete_agent_ip_whitelist: '移除代理 IP 白名单',
  create_admin_user: '新增管理员账号', update_admin_user: '修改管理员角色/状态', disable_admin_user: '停用管理员账号',
  publish_email_template: '发布邮件模板', archive_email_template: '归档邮件模板', retry_email_delivery: '重试邮件投递',
  process_privacy_request: '处理用户隐私请求', approve_privacy_request: '批准隐私请求', reject_privacy_request: '驳回隐私请求',
  update_risk_case: '处理风险事件', resolve_risk_case: '完结风险事件',
  risk_approve: '批准放行风险事件', risk_reject: '拒绝拦截风险事件',
  risk_monitor: '风险事件加入观察', risk_release: '解除风险事件',
  monitor: '加入观察', release: '解除风控',
  execute_compensation: '执行事务补偿', retry_compensation: '重试事务补偿',
  export_business_report: '导出经营报表',
  view_order_relations: '查看订单关联业务',
  view_payment_detail: '查看支付详情',
  view_recharge_detail: '查看充值详情',
  view_sensitive_user_detail: '查看用户敏感资料',
  view_inventory: '查看数字库存',
  update_product_status: '修改商品上架状态',
  update_product_display_state: '修改商品展示状态',
  update_sku_display_state: '修改规格展示状态',
  update_product_sku_metadata: '修改规格元数据与成本',
  save_product_sku_workspace: '保存商品规格配置',
  bulk_activate_product_skus: '批量启用商品规格',
  bind_daju_supplier_product: '绑定大橘供应商商品',
  import_inventory_batch: '批量导入数字库存',
  disable_inventory_batch: '批量停用库存批次',
  update_inventory: '更新数字库存',
  global_search: '后台全局搜索',
  global_search_rate_limited: '全局搜索触发限流',
  database_schema_check: '检查数据库结构',
  update_system_error_status: '更新系统异常状态',
  export_own_personal_data: '导出个人数据',
  revoke_agent_application: '撤销代理申请',
  admin_authorization_create: '新增管理员授权',
  admin_authorization_update: '修改管理员授权',
  announcement_create: '创建系统公告',
  announcement_update: '更新系统公告',
  announcement_enable: '启用系统公告',
  announcement_disable: '停用系统公告',
  check_audit_integrity: '校验审计日志完整性',
  legal_create_draft: '创建法律协议草稿',
  legal_update_draft: '修改法律协议草稿',
  legal_publish: '发布法律协议',
  create_coupons: '批量创建优惠券',
  update_coupon: '更新优惠券状态',
  delete_coupon: '删除优惠券',
};
const riskActionLabels: Record<string, string> = {
  allow: '正常放行',
  allow_with_monitoring: '放行并持续观察',
  require_review: '需人工复核',
  temporarily_block: '临时限制操作',
  temporarily_restrict: '临时限制操作',
  deny: '直接拦截拒绝',
  block: '拦截阻断',
};
const riskRuleLabels: Record<string, string> = {
  ACCOUNT_RECENTLY_CREATED_HIGH_VALUE: '新注册账户高额交易',
  ACCOUNT_RESTRICTED_HIGH_RISK_ACTION: '受限账户发起高风险操作',
  ORDER_UNPAID_BURST: '短时间大量未支付订单',
  ORDER_LARGE_QUANTITY: '单笔异常大数量下单',
  ORDER_SKU_REPEATED_RESERVATION: '同一规格频繁重复锁库',
  PAYMENT_SESSION_BURST: '短时间频繁拉起支付',
  PAYMENT_CHANNEL_SWITCHING: '短时间频繁切换支付渠道',
  PAYMENT_DUPLICATE_PROVIDER_TRADE: '第三方支付流水重复重放',
  RECHARGE_REQUEST_BURST: '短时间高频发起充值',
  RECHARGE_DUPLICATE_CLIENT_REQUEST: '重复提交充值请求',
  REFUND_REQUEST_BURST: '短时间高频申请退款',
  REFUND_RATIO_HIGH: '账号历史退款率过高',
  REFUND_DELIVERED_DIGITAL: '已发货数字商品申请退款',
  SOURCE_SHARED_BY_ACCOUNTS: '同来源多账号关联操作',
};
const riskMetadataKeyLabels: Record<string, string> = {
  channel: '支付渠道',
  channelCode: '支付渠道代码',
  channel_code: '支付渠道代码',
  paymentChannel: '支付渠道',
  payment_channel: '支付渠道',
  paymentMethod: '支付方式',
  payment_method: '支付方式',
  orderNo: '订单号',
  order_no: '订单号',
  rechargeNo: '充值单号',
  recharge_no: '充值单号',
  paymentNo: '支付单号',
  payment_no: '支付单号',
  amount: '交易金额',
  orderAmount: '订单金额',
  payableAmount: '应付金额',
  currency: '币种',
  quantity: '购买数量',
  skuId: '商品规格 ID',
  sku_id: '商品规格 ID',
  productId: '商品 ID',
  product_id: '商品 ID',
  deliveryDelivered: '是否已发货交付',
  delivery_delivered: '是否已发货交付',
  reason: '原因说明',
  provider: '支付平台',
  providerTradeNo: '第三方交易号',
  provider_trade_no: '第三方交易号',
  clientIp: '来源 IP',
  ip: '来源 IP',
  source: '来源',
};
function label(value: unknown, map: Record<string, string>, suffix = '未识别状态'): string {
  if (value == null || value === '') return '—';
  const raw = String(value);
  return map[raw] ?? `${raw}（${suffix}）`;
}
export const businessTypeLabel = (value: unknown) => label(value, businessLabels, '系统类型');
export const statusLabel = (value: unknown) => label(value, statusLabels);
export const workerStatusLabel = (value: unknown) => label(value, workerLabels);
export const detailLabel = (value: unknown) => label(value, detailLabels, '系统类型');
export const riskActionLabel = (value: unknown) => label(value, riskActionLabels, '风控策略');
export const riskRuleLabel = (value: unknown) => label(value, riskRuleLabels, '风控规则');
export const riskMetadataKeyLabel = (key: string) => riskMetadataKeyLabels[key] ?? key;
export const directionLabel = (value: unknown) => label(value, {credit: '余额增加', debit: '余额扣减'}, '系统类型');
export function supplierStatusLabel(value: unknown, retryable?: unknown): string {
  if (value === 'FAILED' || value === 'FAILED_VALIDATION') {
    return retryable === true ? supplierLabels.retryable_failed : retryable === false ? supplierLabels.permanent_failed : '采购失败，需核查是否可以再次尝试';
  }
  return label(value, supplierLabels);
}
export function booleanLabel(value: unknown): string {
  if (value === true || value === 'yes') return '是';
  if (value === false || value === 'no') return '否';
  if (value === 'unknown' || value == null) return '暂未获取';
  return `${String(value)}（未识别状态）`;
}
export const currencyLabel = (value: unknown) => value === 'CNY' ? '人民币（CNY）' : String(value ?? '—');
export function beijingDateTime(value: unknown): string {
  if (value == null || value === '') return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : `${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)}（北京时间）`;
}
export const ledgerBusinessOptions = Object.entries(businessLabels)
  .filter(([value]) => !['recharge', 'order', 'delivery', 'payment', 'account', 'login', 'inventory'].includes(value))
  .map(([value, label]) => ({value, label}));
export const workerHelpText = '这里只显示系统采集到的运行状态。如果定时任务状态显示“暂未获取”，不代表任务已经停止。此页面不能启动、停止或修改服务器任务。';
export const operationsDateFilterHelp = '筛选范围为北京时间当天 00:00 至 23:59。记录时间显示为北京时间。搜索匹配过多时，请缩小范围。';
