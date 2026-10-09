import { NextResponse } from 'next/server';
import { open } from 'node:fs/promises';
import { requireApiAdmin, requireApiSuperAdmin } from '@/lib/admin/api-auth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { OperationsReadError, readOperationsList, safeWorkerState } from '@/lib/admin/operations-readonly.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function readSmallJson(path: string) {
  let file;
  try {
    file = await open(path, 'r');
    const info = await file.stat();
    if (!info.isFile() || info.size > 65536) return null;
    const buffer = Buffer.alloc(65537);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 65536) return null;
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } catch { return null; } finally { await file?.close(); }
}
export async function GET(request: Request, { params }: { params: { workspace: string } }) {
  const kind = params.workspace;
  if (!['worker', 'ledger', 'supplier-queue'].includes(kind)) return NextResponse.json({ error: '工作台不存在' }, { status: 404 });
  const auth = kind === 'ledger' ? await requireApiSuperAdmin() : await requireApiAdmin();
  if (!auth.ok) return auth.response;
  const headers = { 'Cache-Control': 'no-store' };
  if (kind === 'worker') {
    const [heartbeat, snapshot] = await Promise.all([
      readSmallJson('/run/jianlian-snpay-reconciliation/heartbeat.json'),
      readSmallJson('/run/jianlian-operations/worker-status.json'),
    ]);
    return NextResponse.json({ worker: safeWorkerState(heartbeat, snapshot) }, { headers });
  }
  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: '工作台服务不可用' }, { status: 503, headers });
  try {
    return NextResponse.json(await readOperationsList(service, kind, new URL(request.url).searchParams), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof OperationsReadError ? error.message : '读取失败，请稍后重试' }, { status: error instanceof OperationsReadError ? 400 : 503, headers });
  }
}
