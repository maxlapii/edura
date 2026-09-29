import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
const signInEmail = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { email: (...args: unknown[]) => signInEmail(...args) } } }));

const { LoginForm } = await import("@/app/(auth)/login/login-form");

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  signInEmail.mockReset();
});

describe("LoginForm", () => {
  it("submits credentials and redirects to the dashboard on success", async () => {
    signInEmail.mockResolvedValue({ error: null });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/Email/), "teacher@edura.dev");
    await userEvent.type(screen.getByLabelText(/Password/), "Password123!");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(signInEmail).toHaveBeenCalledWith({ email: "teacher@edura.dev", password: "Password123!" }));
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server error and stays on the page when sign-in fails", async () => {
    signInEmail.mockResolvedValue({ error: { message: "Invalid email or password" } });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/Email/), "x@y.dev");
    await userEvent.type(screen.getByLabelText(/Password/), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
