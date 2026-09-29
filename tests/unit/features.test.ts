import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { FEATURES, disabledFeatureFor, isEnabled, isHrefDisabled } from "@/lib/features";
import { navForUser, quickActionsForUser } from "@/lib/nav";
import { proxy } from "@/proxy";
import type { AuthUser } from "@/lib/auth/types";

const admin: AuthUser = { id: "u", email: "e", name: "N", role: "SCHOOL_ADMIN", schoolId: "s", isActive: true };
const teacher: AuthUser = { ...admin, role: "TEACHER" };
const original = Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [k, f.enabled]));
afterEach(() => {
  for (const [k, v] of Object.entries(original)) FEATURES[k as keyof typeof FEATURES].enabled = v;
});

describe("feature switches", () => {
  it("maps pages and API routes to their feature", () => {
    expect(disabledFeatureFor("/admin/discipline")).toBe("discipline");
    expect(disabledFeatureFor("/admin/discipline/abc")).toBe("discipline");
    expect(disabledFeatureFor("/api/report-cards/x/publish")).toBe("reportCards");
    expect(disabledFeatureFor("/admin/departments")).toBeNull();
    expect(disabledFeatureFor("/department-x")).toBeNull();
    expect(disabledFeatureFor("/dashboard")).toBeNull();
    expect(isHrefDisabled("/messages/templates?x=1")).toBe(true);
    expect(isEnabled("reportCards")).toBe(false);
  });

  it("removes switched-off features from menus and the create menu, and restores them when enabled", () => {
    const hrefs = () => navForUser(admin).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs()).not.toContain("/admin/support-cases");
    expect(hrefs()).not.toContain("/admin/approvals");
    expect(hrefs()).toContain("/admin/leave");
    FEATURES.supportCases.enabled = true;
    expect(hrefs()).toContain("/admin/support-cases");
    expect(disabledFeatureFor("/admin/support-cases")).toBeNull();
    const actions = quickActionsForUser(teacher).map((a) => a.href);
    expect(actions).toEqual(expect.arrayContaining(["/assignments/new", "/leave"]));
    expect(navForUser(teacher).flatMap((s) => s.items.map((i) => i.href))).not.toContain("/professional-development");
  });
});

describe("proxy", () => {
  it("returns 404 JSON for API routes and rewrites pages of switched-off features", async () => {
    const api = proxy(new NextRequest("http://localhost/api/discipline"));
    expect(api.status).toBe(404);
    expect((await api.json()).error.code).toBe("NOT_FOUND");
    const page = proxy(new NextRequest("http://localhost/admin/approvals"));
    expect(page.headers.get("x-middleware-rewrite")).toContain("/feature-unavailable");
    const ok = proxy(new NextRequest("http://localhost/admin/leave"));
    expect(ok.headers.get("x-middleware-next")).toBe("1");
  });
});
