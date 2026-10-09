import type { SupabaseClient } from '@supabase/supabase-js';
export class OperationsReadError extends Error {}
export function operationsFilters(params: URLSearchParams): Record<string, any>;
export function readOperationsList(client: SupabaseClient, kind: string, params: URLSearchParams): Promise<{ rows: Record<string, any>[]; total: number; page: number; pageSize: number }>;
export function safeWorkerState(heartbeat: unknown, snapshot: unknown, now?: number): Record<string, unknown>;
