# BEP20 自动结算只读就绪审计手册

## 目的与边界

本手册仅用于核对 BEP20 自动超额结算、欠额转余额和历史确认时间的数据库依赖。四份审计文件均为 `READ-ONLY / NO BUSINESS DATA MUTATION`，只返回系统目录信息或聚合计数。

自动结算必须继续保持 **Disabled**。本流程：

- 不运行任何 Migration 或修复 SQL；
- 执行 `supabase db push`、`migration up`、`migration repair` 或 `db reset --linked`；
- 配置自动超额阈值、环境变量、Vault、Cron 或内部任务；
- 调用付款完成、余额入账、订单结算或库存处理 RPC；
- 部署应用或处理真实订单。

## 审计文件与固定顺序

每次只在 Supabase SQL Editor 中打开并运行一个完整文件，不要合并运行：

1. `docs/audits/20260729-bep20-settlement-migration-history-audit.sql`
   - 对照五个目标版本的 Migration History 和真实对象证据。
   - `20260730` 没有唯一持久对象标记；脚本会明确标记无法单凭 schema 证明其执行状态。
2. `docs/audits/20260729-bep20-settlement-schema-permission-audit.sql`
   - 核对表、字段、约束、索引、RLS、ACL、函数签名与源码 hash。
   - 发现对象或关键字段缺失时停止，不继续运行后续数据聚合脚本。
3. `docs/audits/20260729-bep20-settlement-integrity-audit.sql`
   - 仅输出归属、链上证据、幂等关联和状态一致性的异常计数。
   - 所有异常计数应由代码与数据库负责人逐项解释；不能据此直接修复数据。
4. `docs/audits/20260729-bep20-settlement-confirmation-time-audit.sql`
   - 输出确认数分桶、确认时间差和确认数配置形状。
   - 历史确认阈值没有可验证历史事件时保持 `unknown`，不得把 12 假定为历史唯一配置。

## 环境执行顺序

### 第一步：隔离测试项目

在 Dashboard 中逐次人工确认：

- 项目：`Jianlian-shop-test`
- Project ref：`czuoivbfxzachiobdohw`

按固定顺序每次只运行一个脚本，并分别保存完整汇总结果。不要运行仓库中的 Migration，不要调用任何业务 RPC。

完成后审查：

- Migration History 和真实对象是否漂移；
- 必需对象、字段、索引和约束是否齐全；
- owner、`SECURITY DEFINER`、`search_path` 和角色权限是否符合预期；
- 完整性异常计数是否均为 0，或是否已有经书面确认的解释；
- 确认时间差和历史确认阈值是否存在无法证明的风险。

### 第二步：正式项目

只有测试项目四份结果全部审查通过后，才允许进入：

- 项目：`Jianlian-shop`
- Project ref：`qvbovrvybirscaurwuov`

再次逐次确认项目名和 Project ref，然后按同样顺序每次只运行一个脚本并保存汇总结果。两个环境都只能执行只读审计。

## 停止条件

遇到下列任一情况立即停止，不运行下一份脚本：

- 当前 Dashboard 项目名或 Project ref 不匹配；
- SQL 文本与仓库已审查版本不一致；
- Migration History 表缺失，或记录和对象状态发生漂移；
- 关键对象、字段、唯一约束、外键、RLS 或权限不符合合同；
- schema 审计提示客户端具有非预期财务写权限；
- 数据完整性异常计数非 0 且尚无书面解释；
- 确认时间出现负值、来源语义无法确认或历史确认阈值无法证明；
- 查询意外返回具体业务标识或敏感内容。

停止后只保存脱敏汇总并进行代码审查。不得现场编写或运行修复 SQL。

## 结果记录

每个环境保存以下信息：

- 项目名和 Project ref；
- 审计文件名与 Git commit；
- 执行时间；
- 单一汇总结果集；
- PASS、REVIEW REQUIRED 或 BLOCKED 判断；
- 审查人和后续只读核对事项。

结果中不得粘贴完整 TxHash、钱包地址、用户标识、订单号、session 标识、邮箱、电话或密钥。

## 明确禁止

- 不运行 `20260727`、`20260728`、`20260729`、`20260730` 或其他 Migration。
- 不重复执行已经通过 SQL Editor 手工执行的 Migration。
- 不使用 `supabase db push`、`migration up`、`migration repair`、`db reset --linked`。
- 不开启自动结算。
- 不配置自动超额绝对值或比例阈值。
- 不部署、不建立 Cron、不调用结算接口。
- 不执行任何修复 SQL或生产财务操作。
