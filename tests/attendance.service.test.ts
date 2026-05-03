import { describe, expect, it } from "vitest";

import {
  aggregateMonthlyAttendance,
  parseAttendanceFile,
  parseUserDirectory,
} from "../src/modules/attendance/attendance.service";
import { ValidationError } from "../src/shared/http/errors";

const users = new Map([
  ["1", "Ada.Lovelace"],
  ["2", "Grace.Hopper"],
]);

const makeBuffer = (text: string) => Buffer.from(text, "utf8");

describe("attendance parser", () => {
  it("parses valid CRLF attendance rows with padded whitespace", () => {
    const events = parseAttendanceFile(
      makeBuffer("     1\t2026-02-01 08:00:00\t1\t0\t1\t0\r\n1 2026-02-01 17:00:00 1 1 1 0\r\n"),
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      userId: "1",
      date: "2026-02-01",
      month: "2026-02",
      timestampText: "2026-02-01T08:00:00",
      type: "checkIn",
    });
    expect(events[1]?.type).toBe("checkOut");
  });

  it("rejects malformed rows, bad timestamps, unknown status bits, empty files, and multiple months", () => {
    expect(() => parseAttendanceFile(makeBuffer("1 2026-02-01 08:00:00 1 0 1\n"))).toThrow(
      ValidationError,
    );
    expect(() =>
      parseAttendanceFile(makeBuffer("1 2026-02-31 08:00:00 1 0 1 0\n")),
    ).toThrow("Line 1 has an invalid timestamp");
    expect(() =>
      parseAttendanceFile(makeBuffer("1 2026-02-01 08:00:00 0 0 0 0\n")),
    ).toThrow("Line 1 has unknown attendance status bits");
    expect(() => parseAttendanceFile(makeBuffer("\n \r\n"))).toThrow(
      "Attendance file is empty.",
    );
    expect(() =>
      parseAttendanceFile(
        makeBuffer("1 2026-02-01 08:00:00 1 0 1 0\n1 2026-03-01 08:00:00 1 1 1 0\n"),
      ),
    ).toThrow("Attendance file must contain events from exactly one month.");
  });

  it("parses the cleaned user directory", () => {
    expect(parseUserDirectory("Ada.Lovelace,1\nGrace.Hopper,2\n")).toEqual(users);
  });
});

describe("attendance aggregation", () => {
  it("sums multiple sessions and supports rows that arrive out of order", () => {
    const events = parseAttendanceFile(
      makeBuffer(
        [
          "1 2026-02-01 12:00:00 1 1 1 0",
          "1 2026-02-01 08:00:00 1 0 1 0",
          "1 2026-02-01 13:00:00 1 0 1 0",
          "1 2026-02-01 17:30:00 1 1 1 0",
          "2 2026-02-02 09:00:00 1 0 1 0",
          "2 2026-02-02 10:15:00 1 1 1 0",
        ].join("\n"),
      ),
    );

    const report = aggregateMonthlyAttendance(events, users, "Feb.dat");

    expect(report.month).toBe("2026-02");
    expect(report.source).toEqual({
      fileName: "Feb.dat",
      rowCount: 6,
      userCount: 2,
    });
    expect(report.totals).toEqual([
      {
        userId: "1",
        name: "Ada.Lovelace",
        totalMinutes: 510,
        totalTime: "8:30",
        attendanceDays: 1,
        pairedSessions: 2,
        issues: {
          duplicateCheckIn: 0,
          invalidSessionDuration: 0,
          unknownUser: 0,
          unmatchedCheckIn: 0,
          unmatchedCheckOut: 0,
        },
      },
      {
        userId: "2",
        name: "Grace.Hopper",
        totalMinutes: 75,
        totalTime: "1:15",
        attendanceDays: 1,
        pairedSessions: 1,
        issues: {
          duplicateCheckIn: 0,
          invalidSessionDuration: 0,
          unknownUser: 0,
          unmatchedCheckIn: 0,
          unmatchedCheckOut: 0,
        },
      },
    ]);
    expect(report.issues).toEqual([]);
  });

  it("flags duplicate check-ins and keeps the earliest open check-in", () => {
    const events = parseAttendanceFile(
      makeBuffer(
        [
          "1 2026-02-01 08:00:00 1 0 1 0",
          "1 2026-02-01 08:05:00 1 0 1 0",
          "1 2026-02-01 10:00:00 1 1 1 0",
        ].join("\n"),
      ),
    );

    const report = aggregateMonthlyAttendance(events, users, "Feb.dat");

    expect(report.totals[0]?.totalMinutes).toBe(120);
    expect(report.totals[0]?.issues.duplicateCheckIn).toBe(1);
    expect(report.issues[0]).toMatchObject({
      type: "duplicateCheckIn",
      userId: "1",
      line: 2,
    });
  });

  it("flags unmatched check-outs, duplicate check-outs, and open check-ins", () => {
    const events = parseAttendanceFile(
      makeBuffer(
        [
          "1 2026-02-01 08:00:00 1 1 1 0",
          "1 2026-02-01 09:00:00 1 0 1 0",
          "1 2026-02-01 10:00:00 1 1 1 0",
          "1 2026-02-01 10:01:00 1 1 1 0",
          "2 2026-02-01 09:00:00 1 0 1 0",
        ].join("\n"),
      ),
    );

    const report = aggregateMonthlyAttendance(events, users, "Feb.dat");
    const ada = report.totals.find((total) => total.userId === "1");
    const grace = report.totals.find((total) => total.userId === "2");

    expect(ada?.totalMinutes).toBe(60);
    expect(ada?.issues.unmatchedCheckOut).toBe(2);
    expect(grace?.totalMinutes).toBe(0);
    expect(grace?.issues.unmatchedCheckIn).toBe(1);
    expect(report.issues.map((issue) => issue.type)).toEqual([
      "unmatchedCheckOut",
      "unmatchedCheckOut",
      "unmatchedCheckIn",
    ]);
  });

  it("flags unknown users and invalid session durations", () => {
    const events = parseAttendanceFile(
      makeBuffer(
        [
          "99 2026-02-01 09:00:00 1 0 1 0",
          "99 2026-02-01 09:00:00 1 1 1 0",
        ].join("\n"),
      ),
    );

    const report = aggregateMonthlyAttendance(events, users, "Feb.dat");

    expect(report.totals).toHaveLength(1);
    expect(report.totals[0]).toMatchObject({
      userId: "99",
      name: null,
      totalMinutes: 0,
      issues: {
        invalidSessionDuration: 1,
        unknownUser: 1,
      },
    });
    expect(report.issues.map((issue) => issue.type)).toEqual([
      "unknownUser",
      "invalidSessionDuration",
    ]);
  });
});
