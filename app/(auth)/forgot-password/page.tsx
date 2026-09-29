"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error) setError(error.message ?? "Something went wrong");
    else setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="font-display text-2xl text-ink">Reset your password</h2>
      {done ? (
        <Alert tone="success">If an account exists for {email}, a reset link has been sent.</Alert>
      ) : (
        <>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email" htmlFor="email" required>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full">
            Send reset link
          </Button>
        </>
      )}
      <p className="text-center text-xs">
        <Link href="/login" className="text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
