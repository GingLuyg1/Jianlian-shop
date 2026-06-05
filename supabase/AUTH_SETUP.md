# Jianlian 正式账号接入步骤

1. 在 Supabase 创建项目。
2. 在 Supabase SQL Editor 执行 `supabase/schema.sql`。
3. 复制 `.env.example` 为 `.env.local`，填写：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. 重启本地开发服务。
5. 打开 `/register` 注册第一个后台邮箱账号。
6. 在 Supabase SQL Editor 执行：

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
```

7. 使用该邮箱登录后访问 `/admin`。

普通注册账号默认角色是 `user`，不能进入后台。
