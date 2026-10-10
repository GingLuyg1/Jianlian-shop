/** Presentation only: never use these labels as API/filter/database values. */
const businessLabels: Record<string, string> = {
  account_recharge: '账户充值', recharge: '账户充值', order_payment: '订单支付', order: '商品订单',
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
  open: '待处理', resolved: '已解决', running: '正在运行', ready: '已就绪', not_configured: '未配置',
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
export const ledgerBusinessOptions = Object.entries(businessLabels).filter(([value]) => !['recharge', 'order'].includes(value)).map(([value, label]) => ({value, label}));
export const workerHelpText = '这里只显示系统采集到的运行状态。如果定时任务状态显示“暂未获取”，不代表任务已经停止。此页面不能启动、停止或修改服务器任务。';
export const operationsDateFilterHelp = '筛选范围为北京时间当天08:00至次日08:00（结束日期含次日08:00前的记录）。记录时间显示为北京时间。搜索匹配过多时，请缩小范围。';
