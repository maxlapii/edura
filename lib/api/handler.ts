import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getAuthUserFromHeaders } from "@/lib/auth/session";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, type Permission } from "@/lib/permissions";
import { AppError, isAppError } from "@/lib/utils/errors";

export type RouteParams = Record<string, string>;

export interface HandlerContext {
  req: NextRequest;
  user: AuthUser;
  params: RouteParams;
  ip: string | null;
}

type Handler = (ctx: HandlerContext) => Promise<Response | unknown>;

interface Options {
  /** Coarse permission required to call this route. Object-level checks live in services. */
  permission?: Permission | Permission[];
}

function isPrismaKnownError(err: unknown): err is { code: string; meta?: Record<string, unknown> } {
  return typeof err === "object" && err !== null && "code" in err && typeof (err as { code: unknown }).code === "string" && (err as { code: string }).code.startsWith("P");
}

export function errorResponse(err: unknown): NextResponse {
  if (isAppError(err)) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: err.issues } },
      { status: 422 },
    );
  }
  if (isPrismaKnownError(err)) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: { code: "CONFLICT", message: "A record with the same unique value already exists", details: err.meta ?? null } }, { status: 409 });
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Record not found" } }, { status: 404 });
    }
    if (err.code === "P2003") {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Related record does not exist" } }, { status: 400 });
    }
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Internal server error" } }, { status: 500 });
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Wraps a Route Handler with authentication, permission check and uniform error handling.
 * Handlers may return a Response or a plain value (wrapped as { data }).
 */
export function withAuth(handler: Handler, options: Options = {}) {
  return async (req: NextRequest, ctx?: { params?: Promise<RouteParams> | RouteParams }) => {
    try {
      const user = await getAuthUserFromHeaders(req.headers);
      if (!user) throw AppError.unauthorized();
      if (options.permission) {
        const perms = Array.isArray(options.permission) ? options.permission : [options.permission];
        const allowed = perms.some((p) => {
          try {
            assertPermission(user, p);
            return true;
          } catch {
            return false;
          }
        });
        if (!allowed) throw AppError.forbidden(`Missing permission: ${perms.join(" or ")}`);
      }
      const params = (await ctx?.params) ?? {};
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const result = await handler({ req, user, params, ip });
      if (result instanceof Response) return result;
      return ok(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Wraps a public Route Handler (no auth) with uniform error handling. */
export function withErrorHandling(handler: (req: NextRequest, params: RouteParams) => Promise<Response | unknown>) {
  return async (req: NextRequest, ctx?: { params?: Promise<RouteParams> | RouteParams }) => {
    try {
      const params = (await ctx?.params) ?? {};
      const result = await handler(req, params);
      if (result instanceof Response) return result;
      return ok(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw AppError.badRequest("Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string | string[]> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    const existing = obj[key];
    if (existing === undefined) obj[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else obj[key] = [existing, value];
  });
  return schema.parse(obj);
}
