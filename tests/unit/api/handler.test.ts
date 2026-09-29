import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { AppError } from "@/lib/utils/errors";
import type { AuthUser } from "@/lib/auth/types";

const getAuthUserFromHeaders = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAuthUserFromHeaders: (...args: unknown[]) => getAuthUserFromHeaders(...args) }));

const { withAuth, withErrorHandling, errorResponse, parseBody, parseQuery, created, noContent } = await import("@/lib/api/handler");

const teacher: AuthUser = { id: "u1", email: "t@x", name: "T", role: "TEACHER", schoolId: "s1", isActive: true };
const req = (url = "http://localhost/api/x", init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(url, init);

beforeEach(() => getAuthUserFromHeaders.mockReset());

describe("errorResponse", () => {
  it("maps AppError, ZodError, Prisma errors and unknown errors", async () => {
    expect(errorResponse(AppError.notFound("X")).status).toBe(404);
    expect(errorResponse(AppError.forbidden()).status).toBe(403);
    let r = errorResponse(new ZodError([]));
    expect(r.status).toBe(422);
    r = errorResponse({ code: "P2002", meta: { target: ["email"] } });
    expect(r.status).toBe(409);
    expect(errorResponse({ code: "P2025" }).status).toBe(404);
    expect(errorResponse({ code: "P2003" }).status).toBe(400);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    r = errorResponse(new Error("boom"));
    expect(r.status).toBe(500);
    expect((await r.json()).error.message).toBe("Internal server error");
    spy.mockRestore();
  });
});

describe("withAuth", () => {
  it("returns 401 without a session", async () => {
    getAuthUserFromHeaders.mockResolvedValue(null);
    const res = await withAuth(async () => ({ ok: true }))(req());
    expect(res.status).toBe(401);
  });
  it("returns 403 when the coarse permission is missing", async () => {
    getAuthUserFromHeaders.mockResolvedValue(teacher);
    const res = await withAuth(async () => ({ ok: true }), { permission: "users:manage" })(req());
    expect(res.status).toBe(403);
    const any = await withAuth(async () => ({ ok: true }), { permission: ["users:manage", "attendance:record"] })(req());
    expect(any.status).toBe(200);
  });
  it("wraps plain values, passes params and ip, and maps thrown errors", async () => {
    getAuthUserFromHeaders.mockResolvedValue(teacher);
    const handler = withAuth(async ({ user, params, ip }) => ({ user: user.id, id: params.id, ip }));
    const res = await handler(req("http://localhost/api/x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }), { params: Promise.resolve({ id: "42" }) });
    expect(await res.json()).toEqual({ data: { user: "u1", id: "42", ip: "1.2.3.4" } });
    const failing = withAuth(async () => {
      throw AppError.conflict("dup", { field: "x" });
    });
    const fail = await failing(req());
    expect(fail.status).toBe(409);
    expect((await fail.json()).error.details).toEqual({ field: "x" });
    const raw = await withAuth(async () => noContent())(req());
    expect(raw.status).toBe(204);
  });
});

describe("withErrorHandling / parsing", () => {
  it("handles public routes", async () => {
    const res = await withErrorHandling(async () => ({ pong: true }))(req());
    expect(await res.json()).toEqual({ data: { pong: true } });
    const err = await withErrorHandling(async () => {
      throw AppError.badRequest("bad");
    })(req());
    expect(err.status).toBe(400);
  });
  it("parses bodies and query strings", async () => {
    const schema = z.object({ a: z.coerce.number(), tags: z.array(z.string()).optional() });
    expect(await parseBody(req("http://localhost/x", { method: "POST", body: JSON.stringify({ a: "1" }) }), schema)).toEqual({ a: 1 });
    await expect(parseBody(req("http://localhost/x", { method: "POST", body: "not json" }), schema)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(parseQuery(req("http://localhost/x?a=2&tags=x&tags=y"), schema)).toEqual({ a: 2, tags: ["x", "y"] });
    expect(() => parseQuery(req("http://localhost/x?a=zzz"), schema)).toThrow(ZodError);
    expect(created({ id: 1 }).status).toBe(201);
  });
});
