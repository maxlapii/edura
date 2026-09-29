import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "Password123!";

/** Signs in through the real login form. */
export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|admin)/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** Signs in with the JSON auth API and returns a request context carrying the session cookie. */
export async function apiLogin(request: APIRequestContext, baseURL: string, email: string, password = PASSWORD) {
  const res = await request.post(`${baseURL}/api/auth/sign-in/email`, { data: { email, password } });
  expect(res.ok(), `sign in ${email}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return request;
}

export async function apiCall<T = unknown>(request: APIRequestContext, baseURL: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, data?: unknown): Promise<T> {
  const res = await request.fetch(`${baseURL}${path}`, { method, data });
  const text = await res.text();
  expect(res.ok(), `${method} ${path} → ${res.status()} ${text}`).toBeTruthy();
  return text ? (JSON.parse(text).data as T) : (undefined as T);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const isoDow = (d = new Date()) => (d.getUTCDay() === 0 ? 7 : d.getUTCDay());
export const uid = () => Math.random().toString(36).slice(2, 8);
