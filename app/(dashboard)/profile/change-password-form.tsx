"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { Alert, Button, Field, Input } from "@/components/ui";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (newPassword.length < 8) return setError("The new password must be at least 8 characters.");
    if (newPassword !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setBusy(false);
    if (error) return setError(error.message ?? "Could not change the password.");
    setDone(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
  }

  return (
    <form onSubmit={onSubmit} data-testid="password-form" className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">Password changed. Other devices have been signed out.</Alert>}
      <Field label="Current password" htmlFor="currentPassword" required>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
      </Field>
      <Field label="New password" htmlFor="newPassword" required hint="At least 8 characters.">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" required>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
      </Field>
      <Button type="submit" disabled={busy} data-testid="submit">
        {busy ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
