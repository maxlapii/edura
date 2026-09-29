"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords do not match");
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) return setError(error.message ?? "Reset failed");
    router.push("/login?reset=1");
  }

  if (!token) return <Alert tone="error">This reset link is invalid or has expired.</Alert>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="font-display text-2xl text-ink">Choose a new password</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="New password" htmlFor="password" required hint="At least 8 characters">
        <Input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" required>
        <Input id="confirm" type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full">
        Update password
      </Button>
      <p className="text-center text-xs">
        <Link href="/login" className="text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
