import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("lets later utilities override earlier conflicting ones", () => {
    expect(cn("block w-full px-3", "w-64")).toBe("block px-3 w-64");
    expect(cn("h-9 rounded-xl", false && "hidden", "h-11")).toBe("rounded-xl h-11");
  });
  it("keeps custom design tokens in the right groups", () => {
    expect(cn("font-display text-[30px] text-ink", "font-medium")).toContain("font-display");
    expect(cn("text-ink", "text-muted")).toBe("text-muted");
    expect(cn("text-sm text-ink")).toBe("text-sm text-ink");
    expect(cn("shadow-card", "shadow-pop")).toBe("shadow-pop");
    expect(cn("rounded-card", "rounded-xl")).toBe("rounded-xl");
    expect(cn("bg-canvas", "bg-white")).toBe("bg-white");
  });
});
