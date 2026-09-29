import { describe, expect, it } from "vitest";
import { csvResponse, toCsv } from "@/lib/reports/csv";

describe("toCsv", () => {
  it("quotes values containing commas, quotes and newlines", () => {
    const csv = toCsv([{ name: 'Smith, "Jo"', note: "a\nb", n: 1, when: new Date("2026-09-28T00:00:00Z"), nothing: null }]);
    expect(csv).toBe('name,note,n,when,nothing\n"Smith, ""Jo""","a\nb",1,2026-09-28T00:00:00.000Z,\n');
  });
  it("respects explicit column order and handles empty input", () => {
    expect(toCsv([{ a: 1, b: 2 }], ["b", "a"])).toBe("b,a\n2,1\n");
    expect(toCsv([], ["x", "y"])).toBe("x,y\n");
    expect(toCsv([])).toBe("");
    expect(toCsv([{ obj: { k: 1 } }])).toBe('obj\n"{""k"":1}"\n');
  });
  it("builds a download response", async () => {
    const res = csvResponse("r.csv", "a\n1\n");
    expect(res.headers.get("Content-Disposition")).toContain('filename="r.csv"');
    expect(await res.text()).toBe("a\n1\n");
  });
});
