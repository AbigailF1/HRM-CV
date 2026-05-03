import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/hrm?schema=public";
process.env.BETTER_AUTH_SECRET ??= "better-auth-test-secret-1234567890";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

vi.mock("../src/shared/http/middleware/auth.js", () => ({
  requireAdminSession: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let createApp: typeof import("../src/app.js").createApp;

beforeAll(async () => {
  ({ createApp } = await import("../src/app.ts"));
});

describe("attendance routes", () => {
  it("aggregates an uploaded attendance file", async () => {
    const attendanceFile = Buffer.from(
      [
        "1 2026-02-01 08:00:00 1 0 1 0",
        "1 2026-02-01 12:00:00 1 1 1 0",
        "1 2026-02-01 13:00:00 1 0 1 0",
        "1 2026-02-01 17:30:00 1 1 1 0",
      ].join("\n"),
      "utf8",
    );

    const response = await request(createApp())
      .post("/api/v1/admin/attendance/monthly-report")
      .attach("attendanceFile", attendanceFile, {
        filename: "Feb.dat",
        contentType: "text/plain",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      month: "2026-02",
      source: {
        fileName: "Feb.dat",
        rowCount: 4,
        userCount: 1,
      },
      issues: [],
    });
    expect(response.body.data.totals).toEqual([
      {
        userId: "1",
        name: "Getnet.Aseffa",
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
    ]);
  });

  it("rejects missing, wrongly typed, oversized, and malformed uploads", async () => {
    const app = createApp();

    const missingResponse = await request(app).post("/api/v1/admin/attendance/monthly-report");
    expect(missingResponse.status).toBe(400);
    expect(missingResponse.body.error.code).toBe("MISSING_ATTENDANCE_FILE");

    const wrongTypeResponse = await request(app)
      .post("/api/v1/admin/attendance/monthly-report")
      .attach("attendanceFile", Buffer.from("not attendance"), {
        filename: "Feb.txt",
        contentType: "text/plain",
      });
    expect(wrongTypeResponse.status).toBe(400);
    expect(wrongTypeResponse.body.error.code).toBe("INVALID_ATTENDANCE_FILE_TYPE");

    const oversizedResponse = await request(app)
      .post("/api/v1/admin/attendance/monthly-report")
      .attach("attendanceFile", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "Feb.dat",
        contentType: "text/plain",
      });
    expect(oversizedResponse.status).toBe(400);
    expect(oversizedResponse.body.error.code).toBe("ATTENDANCE_FILE_TOO_LARGE");

    const malformedResponse = await request(app)
      .post("/api/v1/admin/attendance/monthly-report")
      .attach("attendanceFile", Buffer.from("1 2026-02-01 08:00:00 1 0 1\n"), {
        filename: "Feb.dat",
        contentType: "text/plain",
      });
    expect(malformedResponse.status).toBe(400);
    expect(malformedResponse.body.error.code).toBe("VALIDATION_ERROR");
    expect(malformedResponse.body.error.message).toContain("Line 1 is malformed");
  });
});
