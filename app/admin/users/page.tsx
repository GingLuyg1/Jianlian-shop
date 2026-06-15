"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase/client";

type AdminUserRow = {
  id: string;
  email: string | null;
  role: string | null;
  balance: number | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadUsers() {
      if (!hasSupabaseConfig()) {
        setMessage("Supabase 未配置，暂时无法读取用户数据。");
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await getSupabaseBrowserClient()
          .from("profiles")
          .select("id,email,role,balance,created_at")
          .order("created_at", { ascending: false });

        if (error) {
          setMessage("暂无权限或 profiles 表尚未创建。");
          console.error("[Admin Users] Failed to load profiles", error);
          return;
        }

        setUsers(
          (data ?? []).map((item: any) => ({
            id: String(item.id),
            email: item.email ?? null,
            role: item.role ?? "user",
            balance: Number(item.balance ?? 0),
            created_at: item.created_at ?? null,
          }))
        );
      } catch (error) {
        setMessage("用户数据读取失败，请稍后重试。");
        console.error("[Admin Users] Failed to load profiles", error);
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  return (
    <AdminLayout>
      <h1 className="mb-4 text-xl font-bold text-foreground">用户管理</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              正在读取用户数据...
            </div>
          ) : message ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {message}
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              暂无用户数据
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">用户邮箱</TableHead>
                    <TableHead className="text-xs">角色</TableHead>
                    <TableHead className="text-xs">余额</TableHead>
                    <TableHead className="text-xs">注册时间</TableHead>
                    <TableHead className="text-xs text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-xs font-medium">
                        {user.email || "未设置邮箱"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.role === "admin"
                              ? "border-blue-200 bg-blue-50 text-[10px] text-blue-700"
                              : "border-slate-200 bg-slate-50 text-[10px] text-slate-600"
                          }
                        >
                          {user.role || "user"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        ¥{Number(user.balance ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        查看
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
