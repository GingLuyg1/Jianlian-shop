# 正式库协议版本化只读审计查询

- 目标项目：Jianlian-shop
- Project ref：`qvbovrvybirscaurwuov`

## 人工执行要求

1. 在 Supabase Dashboard 人工确认项目名和 Project ref 完全一致。
2. 按下表顺序逐个打开 SQL 文件，每次只执行一份文件。
3. 不要点击 Run all，不要临时修改查询，不要追加任何写语句或业务 RPC 调用。
4. 每次执行后按建议名称导出 CSV；即使结果为 `NO_ROWS` 也要导出。
5. `13-document-status-summary.sql` 只输出类型、状态和数量，不输出协议正文、标题、版本、哈希或用户信息。
6. 当前部分协议正文只是测试内容“1”，不得继续发布、覆盖或归档；本目录只用于审计。
7. 将 14 份 CSV 一并交回 Codex 分析，再决定是否需要最小兼容性 Migration。

## 执行顺序与 CSV 文件名

| 顺序 | SQL 文件 | 用途 | 建议 CSV 文件名 |
| --- | --- | --- | --- |
| 01 | `01-target-tables.sql` | 三张协议/证据目标表的存在性和表类型 | `01-target-tables.csv` |
| 02 | `02-dependent-objects.sql` | `orders`、`profiles`、`auth.users` 和 `gen_random_uuid()` 依赖 | `02-dependent-objects.csv` |
| 03 | `03-legal-columns.sql` | 三张目标表的全部字段、类型、默认值和可空性 | `03-legal-columns.csv` |
| 04 | `04-primary-unique-constraints.sql` | 主键与唯一约束 | `04-primary-unique-constraints.csv` |
| 05 | `05-foreign-keys.sql` | 外键定义及更新/删除规则 | `05-foreign-keys.csv` |
| 06 | `06-check-constraints.sql` | 协议类型、状态、接受来源等 CHECK 约束 | `06-check-constraints.csv` |
| 07 | `07-indexes.sql` | 全部索引、唯一性、有效性及部分索引条件 | `07-indexes.csv` |
| 08 | `08-rls-status.sql` | RLS 开关、强制状态与表 owner | `08-rls-status.csv` |
| 09 | `09-policies.sql` | 全部 RLS policy 定义 | `09-policies.csv` |
| 10 | `10-table-privileges.sql` | 常用 Supabase 角色和 PUBLIC 的表级权限 | `10-table-privileges.csv` |
| 11 | `11-triggers.sql` | 仓库基线未声明的触发器检查 | `11-triggers.csv` |
| 12 | `12-related-functions.sql` | 相关函数签名、定义、安全属性和 EXECUTE 权限 | `12-related-functions.csv` |
| 13 | `13-document-status-summary.sql` | 协议记录按类型/状态聚合及总数 | `13-document-status-summary.csv` |
| 14 | `14-contract-compatibility-summary.sql` | 基线、增强 API 和订单证据字段契约兼容性 | `14-contract-compatibility-summary.csv` |

## 当前已知现象（不是数据库结构结论）

- `GET /api/legal/current` 返回 HTTP 503，并明确缺少 `purchase_notice`。
- 后台可见用户协议、退款政策和数字商品交付规则的 published 记录；商品购买须知目前只有 draft。
- 发布或保存错误被应用统一显示为“协议版本表尚未初始化”，不能据此判断缺表。
- 正式库结构、RLS、权限、约束及现有记录保护范围，必须以本目录导出的结果为准。
