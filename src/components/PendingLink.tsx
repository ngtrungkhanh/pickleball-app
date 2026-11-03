'use client';

import Link, { useLinkStatus } from 'next/link';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

function LinkContent({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();

  return (
    <span className="inline-flex items-center justify-center gap-1.5" aria-live="polite" role={pending ? 'status' : undefined}>
      {pending ? <><LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />Đang mở…</> : children}
    </span>
  );
}

export function PendingLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}><LinkContent>{children}</LinkContent></Link>;
}
