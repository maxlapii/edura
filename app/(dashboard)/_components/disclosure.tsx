"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

/** Toggles a block of content (e.g. an edit form) behind a button. */
export function Disclosure({ label, openLabel = "Close", children, defaultOpen = false, testId }: { label: string; openLabel?: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={testId}>
        {open ? openLabel : label}
      </Button>
      {open && <div>{children}</div>}
    </div>
  );
}
