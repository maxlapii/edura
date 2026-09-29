"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/api";

/** Marks the announcement as read once on mount (fire-and-forget, then refresh unread badges). */
export function MarkAnnouncementRead({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/announcements/${id}/read`, { method: "POST" })
      .then(() => {
        if (!cancelled) router.refresh();
      })
      .catch(() => {
        /* best effort */
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);
  return null;
}
