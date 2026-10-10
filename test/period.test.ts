import { afterEach, describe, expect, it, vi } from "vitest";
import {
  differenceInCalendarDays,
  differenceInDays,
  isFirstDayOfMonth,
  isLastDayOfMonth,
  statisticsPeriod,
  todayPeriod,
} from "../src/data/period";
import type { StatPeriod } from "../src/types";

/** Local midnight at the start of the day (month is 1-based). */
function dayStart(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Local 23:59:59.999, the inclusive end the Energy date picker sets (month is 1-based). */
function dayEnd(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

const HOUR = 3_600_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("test time zone", () => {
  it("runs in Europe/Bucharest (UTC+3 before and UTC+2 after the DST end on 25 Oct 2026)", () => {
    expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).toBe(-180);
    expect(new Date(2026, 9, 25, 12).getTimezoneOffset()).toBe(-120);
  });

  it("reports Europe/Bucharest as the resolved Intl time zone", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Bucharest");
  });
});

describe("statisticsPeriod: picker selections (end = 23:59:59.999 local)", () => {
  // Sunday 11 Oct 2026, 15:30; only used where the range has no end.
  const now = new Date(2026, 9, 11, 15, 30);

  interface Case {
    label: string;
    start: Date;
    end: Date;
    days: number;
    expected: StatPeriod;
  }
  const range = (label: string, start: Date, end: Date, days: number, expected: StatPeriod): Case => ({
    label,
    start,
    end,
    days,
    expected,
  });

  it.each<Case>([
    range("today (Sun 11 Oct 2026)", dayStart(2026, 10, 11), dayEnd(2026, 10, 11), 0, "hour"),
    range("yesterday (Sat 10 Oct 2026)", dayStart(2026, 10, 10), dayEnd(2026, 10, 10), 0, "hour"),
    range("3-day range Mon 5 - Wed 7 Oct", dayStart(2026, 10, 5), dayEnd(2026, 10, 7), 2, "hour"),
    range("4-day range Mon 5 - Thu 8 Oct", dayStart(2026, 10, 5), dayEnd(2026, 10, 8), 3, "day"),
    range("week Mon 5 - Sun 11 Oct", dayStart(2026, 10, 5), dayEnd(2026, 10, 11), 6, "day"),
    range("August 2026", dayStart(2026, 8, 1), dayEnd(2026, 8, 31), 30, "day"),
    range("October 2026 (DST ends 25 Oct)", dayStart(2026, 10, 1), dayEnd(2026, 10, 31), 30, "day"),
    range("February 2026", dayStart(2026, 2, 1), dayEnd(2026, 2, 28), 27, "day"),
    range("Aug + Sep 2026 (two whole months)", dayStart(2026, 8, 1), dayEnd(2026, 9, 30), 60, "month"),
    range("Q1 2026 (DST starts 29 Mar)", dayStart(2026, 1, 1), dayEnd(2026, 3, 31), 89, "month"),
    range("whole year 2026", dayStart(2026, 1, 1), dayEnd(2026, 12, 31), 364, "month"),
    range("15 Jan - 31 Mar (start not the 1st)", dayStart(2026, 1, 15), dayEnd(2026, 3, 31), 75, "day"),
    range("1 Jan - 15 Mar (end not a month end)", dayStart(2026, 1, 1), dayEnd(2026, 3, 15), 73, "day"),
  ])("$label: $days full days -> $expected", ({ start, end, days, expected }) => {
    expect(differenceInDays(end, start)).toBe(days);
    expect(statisticsPeriod(start, end, now)).toBe(expected);
  });
});

describe("statisticsPeriod: open end (end undefined = until now)", () => {
  const start = dayStart(2026, 8, 1);

  it("uses month when now is 40 days after the 1st of a month", () => {
    const now = new Date(2026, 8, 10, 12, 0);
    expect(differenceInDays(now, start)).toBe(40);
    expect(statisticsPeriod(start, undefined, now)).toBe("month");
  });

  it("uses day when now is 10 days after the 1st of a month", () => {
    const now = new Date(2026, 7, 11, 12, 0);
    expect(differenceInDays(now, start)).toBe(10);
    expect(statisticsPeriod(start, undefined, now)).toBe("day");
  });

  it("uses hour when now is on the start day", () => {
    expect(statisticsPeriod(start, undefined, new Date(2026, 7, 1, 18, 0))).toBe("hour");
  });

  it("uses day, not month, 40 days after a start that is not the 1st", () => {
    const midMonth = dayStart(2026, 8, 2);
    expect(statisticsPeriod(midMonth, undefined, new Date(2026, 8, 11, 12, 0))).toBe("day");
  });

  it("defaults now to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10, 12, 0));
    expect(statisticsPeriod(start, undefined)).toBe("month");
    vi.setSystemTime(new Date(2026, 7, 11, 12, 0));
    expect(statisticsPeriod(start, undefined)).toBe("day");
  });
});

describe("differenceInDays (date-fns semantics: full local days, truncated toward zero)", () => {
  it("matches the date-fns examples", () => {
    expect(differenceInDays(new Date(2012, 6, 2, 0, 0), new Date(2011, 6, 2, 23, 0))).toBe(365);
    expect(differenceInDays(new Date(2011, 6, 3, 0, 1), new Date(2011, 6, 2, 23, 59))).toBe(0);
  });

  it("counts local days across DST: 1 Mar - 1 Jun 2026 is 92 days although it has 92 * 24 - 1 hours", () => {
    const start = dayStart(2026, 3, 1);
    const end = dayStart(2026, 6, 1);
    expect((end.getTime() - start.getTime()) / HOUR).toBe(92 * 24 - 1);
    expect(differenceInDays(end, start)).toBe(92);
  });

  it("counts the 23-hour DST start day (29 Mar 2026) as one full day", () => {
    const start = new Date(2026, 2, 28, 12, 0);
    const end = new Date(2026, 2, 29, 12, 0);
    expect((end.getTime() - start.getTime()) / HOUR).toBe(23);
    expect(differenceInDays(end, start)).toBe(1);
  });

  it("counts the 25-hour DST end day (25 Oct 2026) as one full day", () => {
    const start = new Date(2026, 9, 24, 12, 0);
    const end = new Date(2026, 9, 25, 12, 0);
    expect((end.getTime() - start.getTime()) / HOUR).toBe(25);
    expect(differenceInDays(end, start)).toBe(1);
    expect(differenceInDays(dayEnd(2026, 10, 25), dayStart(2026, 10, 25))).toBe(0);
  });

  it("truncates a partial last day", () => {
    expect(differenceInDays(new Date(2026, 9, 3, 11, 59), new Date(2026, 9, 1, 12, 0))).toBe(1);
    expect(differenceInDays(new Date(2026, 9, 3, 12, 0), new Date(2026, 9, 1, 12, 0))).toBe(2);
  });

  it("is negative when the first date is earlier, truncated toward zero", () => {
    expect(differenceInDays(new Date(2026, 9, 1, 10, 0), new Date(2026, 9, 3, 12, 0))).toBe(-2);
    expect(differenceInDays(new Date(2026, 9, 1, 14, 0), new Date(2026, 9, 3, 12, 0))).toBe(-1);
  });

  it("returns 0, never -0, for less than one day in either direction", () => {
    const a = new Date(2026, 9, 11, 10, 0);
    const b = new Date(2026, 9, 11, 12, 0);
    expect(Object.is(differenceInDays(a, a), 0)).toBe(true);
    expect(Object.is(differenceInDays(a, b), 0)).toBe(true);
    expect(Object.is(differenceInDays(b, a), 0)).toBe(true);
  });
});

describe("differenceInCalendarDays", () => {
  it("counts calendar days and ignores the time of day, also across DST", () => {
    expect(differenceInCalendarDays(new Date(2026, 9, 25, 0, 1), new Date(2026, 9, 24, 23, 59))).toBe(1);
    expect(differenceInCalendarDays(dayEnd(2026, 10, 31), dayStart(2026, 10, 1))).toBe(30);
    expect(differenceInCalendarDays(dayStart(2026, 3, 1), dayStart(2026, 3, 30))).toBe(-29);
  });
});

describe("isFirstDayOfMonth / isLastDayOfMonth", () => {
  it("isFirstDayOfMonth is true on the 1st at any time of day, false otherwise", () => {
    expect(isFirstDayOfMonth(dayStart(2026, 1, 1))).toBe(true);
    expect(isFirstDayOfMonth(dayEnd(2026, 10, 1))).toBe(true);
    expect(isFirstDayOfMonth(dayStart(2026, 10, 2))).toBe(false);
    expect(isFirstDayOfMonth(dayEnd(2026, 12, 31))).toBe(false);
  });

  it("isLastDayOfMonth is true on the last calendar day, including 28 Feb 2026 and 29 Feb 2028", () => {
    expect(isLastDayOfMonth(dayEnd(2026, 1, 31))).toBe(true);
    expect(isLastDayOfMonth(dayEnd(2026, 2, 28))).toBe(true);
    expect(isLastDayOfMonth(dayEnd(2028, 2, 29))).toBe(true);
    expect(isLastDayOfMonth(dayEnd(2026, 4, 30))).toBe(true);
    expect(isLastDayOfMonth(dayEnd(2026, 10, 31))).toBe(true);
    expect(isLastDayOfMonth(dayStart(2026, 12, 31))).toBe(true);
  });

  it("isLastDayOfMonth is false on other days", () => {
    expect(isLastDayOfMonth(dayEnd(2028, 2, 28))).toBe(false);
    expect(isLastDayOfMonth(dayEnd(2026, 1, 30))).toBe(false);
    expect(isLastDayOfMonth(dayEnd(2026, 10, 30))).toBe(false);
    expect(isLastDayOfMonth(dayStart(2026, 11, 1))).toBe(false);
  });
});

describe("todayPeriod", () => {
  it("spans local 00:00:00.000 to 23:59:59.999 of the given day", () => {
    expect(todayPeriod(new Date(2026, 9, 11, 15, 30))).toStrictEqual({
      start: dayStart(2026, 10, 11),
      end: dayEnd(2026, 10, 11),
    });
  });

  it("gives the same day at 00:00:00.000 and at 23:59:59.999", () => {
    expect(todayPeriod(dayStart(2026, 10, 11))).toStrictEqual(todayPeriod(dayEnd(2026, 10, 11)));
  });

  it("on the DST end day (25 Oct 2026) spans 25 hours: 00:00 UTC+3 to 23:59:59.999 UTC+2", () => {
    const { start, end } = todayPeriod(new Date(2026, 9, 25, 10, 0));
    expect(start.toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(end?.toISOString()).toBe("2026-10-25T21:59:59.999Z");
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    expect([end?.getHours(), end?.getMinutes(), end?.getSeconds(), end?.getMilliseconds()]).toEqual([23, 59, 59, 999]);
    expect((end?.getTime() ?? 0) - start.getTime()).toBe(25 * HOUR - 1);
  });

  it("on the DST start day (29 Mar 2026) spans 23 hours: 00:00 UTC+2 to 23:59:59.999 UTC+3", () => {
    const { start, end } = todayPeriod(new Date(2026, 2, 29, 10, 0));
    expect(start.toISOString()).toBe("2026-03-28T22:00:00.000Z");
    expect(end?.toISOString()).toBe("2026-03-29T20:59:59.999Z");
    expect([end?.getHours(), end?.getMinutes(), end?.getSeconds(), end?.getMilliseconds()]).toEqual([23, 59, 59, 999]);
    expect((end?.getTime() ?? 0) - start.getTime()).toBe(23 * HOUR - 1);
  });

  it("maps to the hour statistics period", () => {
    const { start, end } = todayPeriod(new Date(2026, 9, 25, 10, 0));
    expect(statisticsPeriod(start, end)).toBe("hour");
  });

  it("defaults now to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 25, 23, 30));
    expect(todayPeriod()).toStrictEqual({ start: dayStart(2026, 10, 25), end: dayEnd(2026, 10, 25) });
  });
});
