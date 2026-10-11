# Jianlian Shop V2.5 RC 商品统计性能与快照验证

验证日期：2026-10-11（Asia/Shanghai）
环境：独立测试 Supabase `czuoivbfxzachiobdohw`；未访问或压测 Production。

## 结果摘要

数据库端聚合已消除旧方案“客户端分页抓取全部 order_items 后排序”的 1000 行截断风险，也没有 N+1 查询。单次 RPC 在一个 PostgreSQL 语句快照中同时计算总数、排序后的当前页和单商品每日序列。

这并不等于 Production 性能已经通过：测试库只有 41 个商品，真实生产数据规模、缓存命中率和并发尚未验证。当前结论是“具备进入独立预发布的技术条件”，不是“已证明生产容量”。

## 实测

### 精确候选函数，小测试库

| 场景 | 执行时间 | shared hits | 临时写块 |
|---|---:|---:|---:|
| 28 天商品列表，15 条 | 7.060 ms | 1,573 | 0 |
| 365 天商品列表，15 条 | 6.959 ms | 1,573 | 0 |
| 28 天单商品趋势 | 7.384 ms | 1,595 | 0 |

数据口径对账：41 个商品；历史首项商品 8 个去重已付订单、8 件；28 天每日序列合计同为 8/8。

### 合成规模只读 EXPLAIN ANALYZE

在独立测试数据库中使用 CTE 生成 20,000 商品、250,000 订单、500,000 订单项，包含多商品订单、并列值与 365 天数据。聚合、稳定排序和 15 条分页约 1,737 ms；发生 external merge，临时读约 7,349 块、写约 9,545 块。该测试没有写入持久业务表。

此结果证明查询形状可在 8 秒保护内完成这一档合成规模，但 CTE 生成数据不能真实复现 Production 表统计信息、索引选择、磁盘、并发和连接池压力，因此只作为边界证据。

## 索引审阅

测试库已有 `order_items(order_id)`，但没有面向本查询的 paid-date 部分索引，也没有 `order_items(product_id, order_id)` 聚合索引。发布前建议在与 Production 同结构的预发布副本上验证以下候选，而不是直接执行：

```sql
create index concurrently orders_admin_paid_at_id_idx
  on public.orders (paid_at, id)
  where payment_status = 'paid' and paid_at is not null;

create index concurrently order_items_product_order_idx
  on public.order_items (product_id, order_id) include (quantity);
```

商品搜索使用 `%关键词%`，普通 `lower(name)` btree 不能加速该模式。只有预发布实测确认搜索成为瓶颈后，才评估 `pg_trgm` 与 GIN 索引；这需要单独迁移审批。

## 一致性策略

- 同一次 RPC：总数、页数据、排序和趋势共享单语句 MVCC 快照，内部一致。
- 并列值：业务排序字段后固定以商品 UUID 升序作为次级排序，单次请求稳定。
- 不同 HTTP 翻页请求：无法共享同一个 MVCC 快照。期间新增商品、支付状态变化或删除会导致 offset 页漂移，仍可能重复或遗漏。

当前 RC 采用“每次请求为最新一致快照 + 稳定 ID 次序”，并在报告中保留跨页漂移风险。若业务要求多页严格冻结，应在后续版本返回有时效的 `snapshotToken/asOf`，所有页面固定统计水位；若还要覆盖商品更新/删除，则需要服务端快照结果表或物化快照。两者都涉及 API/数据库设计和清理策略，必须另行批准。

## 失败边界与保护

- SQL 与 API 双层限制最多 365 天、固定页长、搜索长度和排序白名单。
- SQL `statement_timeout=8s`；API 也在 8 秒中止等待并 fail closed。
- NULL、未来日期、反向日期、366 天、非法排序和非法 UUID 均拒绝。
- 无权威商品人民币金额继续返回 `null/待核对`；曝光、点击和转化率保持未接入。

## 门禁结论

- 大数据查询结果上限：架构层面已解决。
- 独立测试库功能与小规模执行计划：通过。
- 合成 50 万订单项压力形状：通过，但出现临时磁盘排序。
- Production 规模性能：未验证，进入正式发布前必须在隔离预发布或脱敏等规模副本执行 EXPLAIN、并发读压测和超时观察。
- 候选索引：待审批，未在 Production 执行。
