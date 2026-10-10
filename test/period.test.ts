import { describe, expect, it } from "vitest";

describe("test time zone", () => {
  it("runs in Europe/Bucharest (UTC+3 before and UTC+2 after the DST end on 25 Oct 2026)", () => {
    expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).toBe(-180);
    expect(new Date(2026, 9, 25, 12).getTimezoneOffset()).toBe(-120);
  });

  it("reports Europe/Bucharest as the resolved Intl time zone", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Bucharest");
  });
});
