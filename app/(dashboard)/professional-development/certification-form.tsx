"use client";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Alert, Button, Field, Input } from "@/components/ui";
import { useSubmit } from "../_components/use-submit";

export function CertificationForm({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const { busy, error, run } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const opt = (k: string) => String(fd.get(k) ?? "").trim() || null;
    await run(async () => {
      await apiFetch(`/api/teachers/${teacherId}/certifications`, { method: "POST", json: { name: String(fd.get("name") ?? ""), issuer: opt("issuer"), issuedAt: opt("issuedAt"), expiresAt: opt("expiresAt") } });
      form.reset();
      router.refresh();
    });
  }
  return (
    <form onSubmit={onSubmit} data-testid="certification-form" className="grid gap-3 sm:grid-cols-4">
      {error && (
        <div className="sm:col-span-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <Field label="Name" htmlFor="cert-name" required>
        <Input id="cert-name" name="name" required maxLength={120} />
      </Field>
      <Field label="Issuer" htmlFor="cert-issuer">
        <Input id="cert-issuer" name="issuer" maxLength={120} />
      </Field>
      <Field label="Issued" htmlFor="cert-issued">
        <Input id="cert-issued" name="issuedAt" type="date" />
      </Field>
      <Field label="Expires" htmlFor="cert-expires">
        <Input id="cert-expires" name="expiresAt" type="date" />
      </Field>
      <div className="sm:col-span-4">
        <Button type="submit" size="sm" disabled={busy} data-testid="submit">
          {busy ? "Saving…" : "Add certification"}
        </Button>
      </div>
    </form>
  );
}
