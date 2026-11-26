"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type AdminConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  summaryLines?: Array<{ label: string; value: string }>;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
  initialReason?: string;
  loading?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  summaryLines,
  confirmLabel = "确认执行",
  cancelLabel = "取消",
  destructive = false,
  reasonLabel,
  reasonPlaceholder = "请输入操作备注或原因...",
  reasonRequired = false,
  initialReason = "",
  loading = false,
  onConfirm,
}: AdminConfirmDialogProps) {
  const [reason, setReason] = useState(initialReason);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setError("");
    }
  }, [initialReason, open]);

  async function handleConfirm() {
    const trimmed = reason.trim();
    if (reasonLabel && reasonRequired && !trimmed) {
      setError("请填写操作原因后再确认。");
      return;
    }
    setError("");
    await onConfirm(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {destructive ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> : null}
            <span>{title}</span>
          </DialogTitle>
          {description ? (
            <DialogDescription className="pt-1 text-sm leading-relaxed text-slate-600">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {summaryLines?.length ? (
          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            {summaryLines.map((line) => (
              <div key={line.label} className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-slate-500">{line.label}</span>
                <span className="min-w-0 break-all text-right font-medium text-slate-900">{line.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {reasonLabel ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700">
              {reasonLabel}
              {reasonRequired ? <span className="ml-0.5 text-red-500">*</span> : null}
            </label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError("");
              }}
              placeholder={reasonPlaceholder}
              disabled={loading}
              className="resize-none text-sm"
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            size="sm"
            disabled={loading}
            onClick={() => void handleConfirm()}
          >
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
