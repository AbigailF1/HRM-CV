export type AttendancePunchType = "checkIn" | "checkOut";

export type AttendanceEvent = {
  userId: string;
  date: string;
  month: string;
  timestamp: Date;
  timestampText: string;
  line: number;
  type: AttendancePunchType;
};

export type AttendanceIssueType =
  | "duplicateCheckIn"
  | "invalidSessionDuration"
  | "unknownUser"
  | "unmatchedCheckIn"
  | "unmatchedCheckOut";

export type AttendanceIssueCounts = Record<AttendanceIssueType, number>;

export type AttendanceIssue = {
  type: AttendanceIssueType;
  userId: string;
  name: string | null;
  date?: string;
  line?: number;
  timestamp?: string;
  message: string;
};

export type AttendanceUserTotal = {
  userId: string;
  name: string | null;
  totalMinutes: number;
  totalTime: string;
  attendanceDays: number;
  pairedSessions: number;
  issues: AttendanceIssueCounts;
};

export type MonthlyAttendanceReport = {
  month: string;
  source: {
    fileName: string;
    rowCount: number;
    userCount: number;
  };
  totals: AttendanceUserTotal[];
  issues: AttendanceIssue[];
};

export type UploadedAttendanceFile = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
};
