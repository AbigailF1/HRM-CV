import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ValidationError } from "../../shared/http/errors.js";
import type {
  AttendanceEvent,
  AttendanceIssue,
  AttendanceIssueCounts,
  AttendanceIssueType,
  AttendanceUserTotal,
  MonthlyAttendanceReport,
  UploadedAttendanceFile,
} from "./attendance.types.js";

const userDirectoryPath = resolve(process.cwd(), "src/modules/attendance/data/user.dat");
const checkInBits = "1 0 1 0";
const checkOutBits = "1 1 1 0";
const issueTypes: AttendanceIssueType[] = [
  "duplicateCheckIn",
  "invalidSessionDuration",
  "unknownUser",
  "unmatchedCheckIn",
  "unmatchedCheckOut",
];

type UserSummary = {
  userId: string;
  name: string | null;
  totalMinutes: number;
  attendanceDates: Set<string>;
  pairedSessions: number;
  issues: AttendanceIssueCounts;
};

const createIssueCounts = (): AttendanceIssueCounts => {
  return {
    duplicateCheckIn: 0,
    invalidSessionDuration: 0,
    unknownUser: 0,
    unmatchedCheckIn: 0,
    unmatchedCheckOut: 0,
  };
};

const formatMinutes = (totalMinutes: number) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

const parseStrictTimestamp = (dateText: string, timeText: string, line: number) => {
  const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(timeText);

  if (!dateTimeMatch || !timeMatch) {
    throw new ValidationError(
      `Line ${line} has an invalid timestamp: ${dateText} ${timeText}.`,
      "VALIDATION_ERROR",
    );
  }

  const year = Number(dateTimeMatch[1]);
  const month = Number(dateTimeMatch[2]);
  const day = Number(dateTimeMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = Number(timeMatch[3]);
  const timestamp = new Date(year, month - 1, day, hours, minutes, seconds);

  if (
    timestamp.getFullYear() !== year ||
    timestamp.getMonth() !== month - 1 ||
    timestamp.getDate() !== day ||
    timestamp.getHours() !== hours ||
    timestamp.getMinutes() !== minutes ||
    timestamp.getSeconds() !== seconds
  ) {
    throw new ValidationError(
      `Line ${line} has an invalid timestamp: ${dateText} ${timeText}.`,
      "VALIDATION_ERROR",
    );
  }

  return timestamp;
};

const parseAttendanceText = (text: string): AttendanceEvent[] => {
  const events: AttendanceEvent[] = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const parts = trimmedLine.split(/\s+/);

    if (parts.length !== 7) {
      throw new ValidationError(
        `Line ${lineNumber} is malformed. Expected: user_id YYYY-MM-DD HH:mm:ss bit1 bit2 bit3 bit4.`,
        "VALIDATION_ERROR",
      );
    }

    const [userId, date, time, bit1, bit2, bit3, bit4] = parts;

    if (!/^\d+$/.test(userId)) {
      throw new ValidationError(
        `Line ${lineNumber} has an invalid user_id: ${userId}.`,
        "VALIDATION_ERROR",
      );
    }

    const bits = [bit1, bit2, bit3, bit4].join(" ");
    const type =
      bits === checkInBits ? "checkIn" : bits === checkOutBits ? "checkOut" : undefined;

    if (!type) {
      throw new ValidationError(
        `Line ${lineNumber} has unknown attendance status bits: ${bits}.`,
        "VALIDATION_ERROR",
      );
    }

    const timestamp = parseStrictTimestamp(date, time, lineNumber);

    events.push({
      userId,
      date,
      month: date.slice(0, 7),
      timestamp,
      timestampText: `${date}T${time}`,
      line: lineNumber,
      type,
    });
  }

  if (events.length === 0) {
    throw new ValidationError("Attendance file is empty.", "VALIDATION_ERROR");
  }

  const months = new Set(events.map((event) => event.month));

  if (months.size > 1) {
    throw new ValidationError(
      "Attendance file must contain events from exactly one month.",
      "VALIDATION_ERROR",
    );
  }

  return events;
};

export const parseAttendanceFile = (buffer: Buffer) => {
  return parseAttendanceText(buffer.toString("utf8"));
};

export const parseUserDirectory = (text: string) => {
  const users = new Map<string, string>();

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const parts = trimmedLine.split(",");

    if (parts.length !== 2 || !parts[0].trim() || !/^\d+$/.test(parts[1].trim())) {
      throw new ValidationError(
        `User directory line ${index + 1} is malformed.`,
        "VALIDATION_ERROR",
      );
    }

    users.set(parts[1].trim(), parts[0].trim());
  }

  return users;
};

export const loadUserDirectory = async () => {
  return parseUserDirectory(await readFile(userDirectoryPath, "utf8"));
};

const getOrCreateSummary = (
  summaries: Map<string, UserSummary>,
  userId: string,
  users: Map<string, string>,
) => {
  const existingSummary = summaries.get(userId);

  if (existingSummary) {
    return existingSummary;
  }

  const summary: UserSummary = {
    userId,
    name: users.get(userId) ?? null,
    totalMinutes: 0,
    attendanceDates: new Set<string>(),
    pairedSessions: 0,
    issues: createIssueCounts(),
  };

  summaries.set(userId, summary);
  return summary;
};

const addIssue = (
  issues: AttendanceIssue[],
  summary: UserSummary,
  type: AttendanceIssueType,
  message: string,
  event?: AttendanceEvent,
) => {
  summary.issues[type] += 1;
  issues.push({
    type,
    userId: summary.userId,
    name: summary.name,
    date: event?.date,
    line: event?.line,
    timestamp: event?.timestampText,
    message,
  });
};

const toUserTotal = (summary: UserSummary): AttendanceUserTotal => {
  return {
    userId: summary.userId,
    name: summary.name,
    totalMinutes: summary.totalMinutes,
    totalTime: formatMinutes(summary.totalMinutes),
    attendanceDays: summary.attendanceDates.size,
    pairedSessions: summary.pairedSessions,
    issues: summary.issues,
  };
};

export const aggregateMonthlyAttendance = (
  events: AttendanceEvent[],
  users: Map<string, string>,
  sourceFileName: string,
): MonthlyAttendanceReport => {
  const month = events[0]?.month;

  if (!month) {
    throw new ValidationError("Attendance file is empty.", "VALIDATION_ERROR");
  }

  const summaries = new Map<string, UserSummary>();
  const issues: AttendanceIssue[] = [];
  const eventsByUserDate = new Map<string, AttendanceEvent[]>();

  for (const event of events) {
    const summary = getOrCreateSummary(summaries, event.userId, users);

    if (!summary.name && summary.issues.unknownUser === 0) {
      addIssue(issues, summary, "unknownUser", "User id was not found in the user directory.", event);
    }

    const groupKey = `${event.userId}:${event.date}`;
    const groupedEvents = eventsByUserDate.get(groupKey) ?? [];

    groupedEvents.push(event);
    eventsByUserDate.set(groupKey, groupedEvents);
  }

  for (const eventsForDay of eventsByUserDate.values()) {
    eventsForDay.sort(
      (left, right) =>
        left.timestamp.getTime() - right.timestamp.getTime() || left.line - right.line,
    );

    let openCheckIn: AttendanceEvent | undefined;

    for (const event of eventsForDay) {
      const summary = getOrCreateSummary(summaries, event.userId, users);

      if (event.type === "checkIn") {
        if (openCheckIn) {
          addIssue(
            issues,
            summary,
            "duplicateCheckIn",
            "Check-in occurred while a previous check-in was still open.",
            event,
          );
          continue;
        }

        openCheckIn = event;
        continue;
      }

      if (!openCheckIn) {
        addIssue(
          issues,
          summary,
          "unmatchedCheckOut",
          "Check-out did not have a matching check-in.",
          event,
        );
        continue;
      }

      const durationMinutes = Math.floor(
        (event.timestamp.getTime() - openCheckIn.timestamp.getTime()) / 60_000,
      );

      if (durationMinutes <= 0) {
        addIssue(
          issues,
          summary,
          "invalidSessionDuration",
          "Check-out did not occur after the matching check-in.",
          event,
        );
        openCheckIn = undefined;
        continue;
      }

      summary.totalMinutes += durationMinutes;
      summary.attendanceDates.add(event.date);
      summary.pairedSessions += 1;
      openCheckIn = undefined;
    }

    if (openCheckIn) {
      const summary = getOrCreateSummary(summaries, openCheckIn.userId, users);

      addIssue(
        issues,
        summary,
        "unmatchedCheckIn",
        "Check-in was not followed by a check-out on the same day.",
        openCheckIn,
      );
    }
  }

  const totals = [...summaries.values()]
    .map(toUserTotal)
    .sort(
      (left, right) =>
        (left.name ?? "").localeCompare(right.name ?? "") ||
        Number(left.userId) - Number(right.userId),
    );

  for (const total of totals) {
    for (const issueType of issueTypes) {
      total.issues[issueType] ??= 0;
    }
  }

  return {
    month,
    source: {
      fileName: sourceFileName,
      rowCount: events.length,
      userCount: summaries.size,
    },
    totals,
    issues,
  };
};

export const createMonthlyAttendanceReport = async (file: UploadedAttendanceFile) => {
  const events = parseAttendanceFile(file.buffer);
  const users = await loadUserDirectory();

  return aggregateMonthlyAttendance(events, users, file.originalName);
};
