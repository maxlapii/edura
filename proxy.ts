import { NextResponse, type NextRequest } from "next/server";
import { disabledFeatureFor, FEATURES } from "@/lib/features";

/** Returns 404 for pages and API routes of features that are switched off (see lib/features.ts). */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const feature = disabledFeatureFor(pathname);
  if (!feature) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: `${FEATURES[feature].label} is not enabled for this school`, details: null } }, { status: 404 });
  }
  return NextResponse.rewrite(new URL("/feature-unavailable", request.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|svg|ico|css|js)$).*)"],
};
