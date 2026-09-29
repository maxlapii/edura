"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Alert, Button, buttonClasses } from "@/components/ui";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg space-y-4 py-16">
      <Alert tone="error" title="Something went wrong">
        {error.message || "An unexpected error occurred."}
        {error.digest && <span className="mt-1 block text-xs opacity-70">Reference: {error.digest}</span>}
      </Alert>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/dashboard" className={buttonClasses("outline")}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
