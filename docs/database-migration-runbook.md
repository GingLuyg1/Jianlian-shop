# 数据库 Migration 单会话执行手册

## 适用范围

Supabase SQL Editor 不适合执行依赖临时表、事务内会话状态和多语句顺序的复杂 Migration。此类文件必须通过单一 `psql` 会话完整执行，避免不同语句落入不同会话而丢失临时对象。

已经在任一环境成功执行的 Migration 永远不得修改、重命名或盲目重复执行。Migration 执行失败后，先运行经过审阅的只读 postcheck，确认实际落库边界，再决定补丁方案。

## 安全工具

使用：

```powershell
scripts/db/run-migration.ps1
```

工具会：

- 校验文件存在、SHA-256、`BEGIN` / `COMMIT` 边界；
- 拒绝包含反斜杠开头的 `psql` 元命令；
- 使用一次 `psql --file` 调用执行完整文件；
- 从进程环境读取数据库 URL，不把密码写入命令参数、仓库或日志；
- 在系统临时目录 `jianlian-migration-logs` 记录文件名、SHA、UTC 时间、Project ref、环境和结果；
- 保留 `psql` 非零退出状态。

默认数据库 URL 环境变量：

- 测试：`SUPABASE_DB_URL_TEST`
- 生产：`SUPABASE_DB_URL_PRODUCTION`

不得把 URL 或密码写入仓库文件。URL 主机必须包含显式传入的 Project ref。

## 只校验文件

`-ValidateOnly` 不连接数据库，也不执行 SQL：

```powershell
.\scripts\db\run-migration.ps1 `
  -File ".\supabase\migrations\<migration>.sql" `
  -Environment test `
  -ProjectRef "<test-project-ref>" `
  -ExpectedSha256 "<64位SHA256>" `
  -ValidateOnly
```

## Dry-run

不传 `-Execute` 时，工具只做文件校验、目标 Project ref 校验和 `select 1` 连接测试，不执行 Migration 文件：

```powershell
.\scripts\db\run-migration.ps1 `
  -File ".\supabase\migrations\<migration>.sql" `
  -Environment test `
  -ProjectRef "<test-project-ref>" `
  -ExpectedSha256 "<64位SHA256>"
```

## 测试环境执行

```powershell
.\scripts\db\run-migration.ps1 `
  -File ".\supabase\migrations\<migration>.sql" `
  -Environment test `
  -ProjectRef "<test-project-ref>" `
  -ExpectedSha256 "<64位SHA256>" `
  -Execute
```

## 生产执行

生产执行必须单独授权，并完整输入：

```text
EXECUTE PRODUCTION MIGRATION <project-ref> <migration-file-name> <SHA256>
```

然后使用 `-Execute -ConfirmationText "<完整确认文本>"`。不要把确认文本和数据库 URL 混为一体。

生产 Migration 执行与业务结算必须分开授权。Migration 成功只代表数据库对象或兼容逻辑已落库，不代表任何订单、支付、余额或交付业务已经发生。

## 失败处理

1. 保留工具退出码和不含凭据的运行记录。
2. 停止重试。
3. 执行只读 postcheck，确认事务是否整体回滚、对象是否已存在、数据证据是否已写入。
4. 已有财务或链上证据时，不得删除、回填或覆盖以“恢复干净状态”。
5. 仅在明确证明原 Migration 未成功执行且重试安全时，才重新授权执行。
