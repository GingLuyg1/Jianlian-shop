"use client";

import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

export function AdminDetailBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--admin-v2-control-radius)] text-sm font-medium text-[var(--admin-v2-text-secondary)] transition-colors duration-150 hover:text-[var(--admin-v2-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] sm:min-h-0"
    >
      <ArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  );
}

export function AdminRelatedLink({
  href,
  label,
  detail,
  icon,
}: {
  href: string;
  label: string;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 items-center gap-3 py-3 text-sm text-[var(--admin-v2-text-primary)] transition-colors duration-150 hover:text-[var(--admin-v2-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)]"
    >
      {icon ? <span className="shrink-0 text-[var(--admin-v2-text-muted)]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {detail ? <span className="mt-0.5 block font-mono text-xs text-[var(--admin-v2-text-muted)] [overflow-wrap:anywhere]">{detail}</span> : null}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--admin-v2-text-muted)]">
        查看 <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export type AdminTimelineItem = {
  id: string;
  title: string;
  time?: ReactNode;
  actor?: ReactNode;
  message?: ReactNode;
};

export function AdminTimeline({ items, empty }: { items: AdminTimelineItem[]; empty?: ReactNode }) {
  if (!items.length) return <>{empty ?? null}</>;
  return (
    <ol className="mx-4 mb-4 list-none p-0 sm:mx-5 sm:mb-5">
      {items.map((item) => (
        <li key={item.id} className="relative border-l border-[var(--admin-v2-border)] pb-6 pl-5 last:border-transparent last:pb-0">
          <span className="absolute -left-1 top-1.5 h-2 w-2 rounded-full bg-[var(--admin-v2-primary)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold leading-[22px] text-[var(--admin-v2-text-primary)]">{item.title}</h3>
          {item.time ? <time className="block text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{item.time}</time> : null}
          {item.actor ? <p className="mt-2 text-sm text-[var(--admin-v2-text-secondary)]">{item.actor}</p> : null}
          {item.message ? <p className="mt-0.5 text-xs leading-[18px] text-[var(--admin-v2-text-muted)] [overflow-wrap:anywhere]">{item.message}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function AdminDetailDrawer({
  title,
  eyebrow,
  description,
  status,
  onClose,
  children,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  return (
    <DialogPrimitive.Root open modal onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/30" />
        <DialogPrimitive.Content
          className={cn("fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[820px] flex-col border-l border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] shadow-xl focus:outline-none", className)}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeButtonRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--admin-v2-border)] px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1">
              {eyebrow ? <div className="text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{eyebrow}</div> : null}
              <DialogPrimitive.Title className="mt-0.5 text-lg font-semibold leading-7 text-[var(--admin-v2-text-primary)] [overflow-wrap:anywhere]">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={description ? "mt-1 text-xs leading-[18px] text-[var(--admin-v2-text-muted)] [overflow-wrap:anywhere]" : "sr-only"}>{description ?? "后台详情面板"}</DialogPrimitive.Description>
              {status ? <div className="mt-2 flex flex-wrap gap-2">{status}</div> : null}
            </div>
            <DialogPrimitive.Close
              ref={closeButtonRef}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--admin-v2-control-radius)] transition-colors hover:bg-[var(--admin-v2-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] sm:h-9 sm:w-9"
              aria-label="关闭详情"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
