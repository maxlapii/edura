import { describe, expect, it } from "vitest";
import { availabilityFor, evaluateCandidate, rankSubstitutes, type CandidateTeacher, type SlotNeed } from "@/modules/substitution/eligibility";

const need: SlotNeed = { dayOfWeek: 2, periodId: "p3", subjectId: "MATH", departmentId: "D-MATH", absentTeacherId: "absent" };

function candidate(overrides: Partial<CandidateTeacher> = {}): CandidateTeacher {
  return {
    id: "t1",
    name: "Teacher One",
    status: "ACTIVE",
    subjectIds: [],
    departmentId: null,
    busyKeys: new Set(),
    substitutionKeys: new Set(),
    onLeave: false,
    availability: [],
    substitutionsThisWeek: 0,
    utilization: 70,
    ...overrides,
  };
}

describe("availabilityFor", () => {
  it("prefers period-specific entries over day-wide ones", () => {
    const c = candidate({ availability: [{ dayOfWeek: 2, periodId: null, type: "AVAILABLE" }, { dayOfWeek: 2, periodId: "p3", type: "UNAVAILABLE" }] });
    expect(availabilityFor(c, need)).toBe("UNAVAILABLE");
    expect(availabilityFor(c, { ...need, periodId: "p4" })).toBe("AVAILABLE");
    expect(availabilityFor(candidate(), need)).toBeNull();
  });
});

describe("evaluateCandidate hard constraints", () => {
  it.each<[string, Partial<CandidateTeacher>, RegExp]>([
    ["the absent teacher", { id: "absent" }, /absent teacher/],
    ["inactive teachers", { status: "INACTIVE" }, /status/],
    ["teachers on leave", { onLeave: true }, /leave/],
    ["teachers already teaching", { busyKeys: new Set(["2:p3"]) }, /Already teaching/],
    ["teachers already covering", { substitutionKeys: new Set(["2:p3"]) }, /covering/],
    ["teachers marked unavailable", { availability: [{ dayOfWeek: 2, periodId: "p3", type: "UNAVAILABLE" }] }, /unavailable/],
  ])("excludes %s", (_label, overrides, pattern) => {
    const r = evaluateCandidate(candidate(overrides), need);
    expect(r.eligible).toBe(false);
    expect(r.conflicts.join(" ")).toMatch(pattern);
    expect(r.score).toBe(Number.NEGATIVE_INFINITY);
  });

  it("is eligible when no constraint is violated (busy at another time is fine)", () => {
    const r = evaluateCandidate(candidate({ busyKeys: new Set(["2:p4", "3:p3"]) }), need);
    expect(r.eligible).toBe(true);
    expect(r.conflicts).toEqual([]);
  });
});

describe("evaluateCandidate scoring", () => {
  it("rewards subject and department matches and preferred substitution slots", () => {
    const plain = evaluateCandidate(candidate(), need);
    const subject = evaluateCandidate(candidate({ subjectIds: ["MATH"] }), need);
    const dept = evaluateCandidate(candidate({ departmentId: "D-MATH" }), need);
    const pref = evaluateCandidate(candidate({ availability: [{ dayOfWeek: 2, periodId: null, type: "PREFERRED_SUBSTITUTION" }] }), need);
    expect(subject.score).toBe(plain.score + 40);
    expect(subject.subjectMatch).toBe(true);
    expect(dept.score).toBe(plain.score + 20);
    expect(dept.departmentMatch).toBe(true);
    expect(pref.score).toBe(plain.score + 20);
    expect(pref.reasons).toContain("Prefers substitution at this time");
  });

  it("prefers lighter workloads and fewer substitutions this week", () => {
    const light = evaluateCandidate(candidate({ utilization: 40 }), need);
    const normal = evaluateCandidate(candidate({ utilization: 70 }), need);
    const heavy = evaluateCandidate(candidate({ utilization: 100 }), need);
    expect(light.score).toBeGreaterThan(normal.score);
    expect(normal.score).toBeGreaterThan(heavy.score);
    const busyWeek = evaluateCandidate(candidate({ substitutionsThisWeek: 2 }), need);
    expect(busyWeek.score).toBe(normal.score - 10);
    expect(evaluateCandidate(candidate({ substitutionsThisWeek: 10 }), need).score).toBe(normal.score - 15);
  });
});

describe("rankSubstitutes", () => {
  it("orders eligible candidates by score, then ineligible ones", () => {
    const ranked = rankSubstitutes(
      [
        candidate({ id: "z", name: "Zed", subjectIds: ["MATH"], departmentId: "D-MATH" }),
        candidate({ id: "a", name: "Amy" }),
        candidate({ id: "x", name: "Xavier", status: "SUSPENDED" }),
        candidate({ id: "b", name: "Ben", subjectIds: ["MATH"] }),
      ],
      need,
    );
    expect(ranked.map((r) => r.teacherId)).toEqual(["z", "b", "a", "x"]);
    expect(ranked[3].eligible).toBe(false);
  });
  it("breaks ties alphabetically", () => {
    const ranked = rankSubstitutes([candidate({ id: "2", name: "Bob" }), candidate({ id: "1", name: "Alice" })], need);
    expect(ranked.map((r) => r.name)).toEqual(["Alice", "Bob"]);
  });
});
