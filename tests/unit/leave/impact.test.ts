import { describe, expect, it } from "vitest";
import { affectedSlotDates, overlapsExistingLeave } from "@/modules/leave/impact";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("affectedSlotDates", () => {
  const slots = [
    { id: "mon-1", dayOfWeek: 1 },
    { id: "mon-2", dayOfWeek: 1 },
    { id: "wed", dayOfWeek: 3 },
    { id: "sat", dayOfWeek: 6 },
  ];
  it("expands weekly slots across the leave range", () => {
    // 2026-09-28 is a Monday.
    const hits = affectedSlotDates(slots, d("2026-09-28"), d("2026-09-30"));
    expect(hits.map((h) => `${h.slotId}@${h.date.toISOString().slice(0, 10)}`)).toEqual(["mon-1@2026-09-28", "mon-2@2026-09-28", "wed@2026-09-30"]);
  });
  it("handles single days and multi-week ranges", () => {
    expect(affectedSlotDates(slots, d("2026-09-29"), d("2026-09-29"))).toEqual([]);
    expect(affectedSlotDates(slots, d("2026-09-28"), d("2026-10-11"))).toHaveLength(2 * 2 + 2 + 2);
  });
  it("returns nothing for an inverted range", () => {
    expect(affectedSlotDates(slots, d("2026-09-30"), d("2026-09-28"))).toEqual([]);
  });
});

describe("overlapsExistingLeave", () => {
  const existing = [
    { startDate: d("2026-10-05"), endDate: d("2026-10-07"), status: "APPROVED" },
    { startDate: d("2026-11-01"), endDate: d("2026-11-02"), status: "REJECTED" },
  ];
  it("detects overlap with pending/approved leave only", () => {
    expect(overlapsExistingLeave({ startDate: d("2026-10-07"), endDate: d("2026-10-09") }, existing)).toBe(true);
    expect(overlapsExistingLeave({ startDate: d("2026-10-01"), endDate: d("2026-10-04") }, existing)).toBe(false);
    expect(overlapsExistingLeave({ startDate: d("2026-11-01"), endDate: d("2026-11-01") }, existing)).toBe(false);
  });
});
