import { extname } from "node:path";

import type { Request, Response } from "express";
import multer from "multer";

import { ValidationError } from "../../shared/http/errors.js";
import type { UploadedAttendanceFile } from "./attendance.types.js";

const maxAttendanceFileSizeBytes = 5 * 1024 * 1024;
const allowedAttendanceMimeTypes = new Set([
  "application/octet-stream",
  "text/plain",
  "text/tab-separated-values",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: maxAttendanceFileSizeBytes,
  },
  fileFilter: (req, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();

    if (extension !== ".dat" || !allowedAttendanceMimeTypes.has(mimeType)) {
      req.log.warn(
        {
          requestId: req.requestId,
          path: req.originalUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
          failureReason: "INVALID_ATTENDANCE_FILE_TYPE",
        },
        "attendance upload rejected for file type",
      );
      callback(
        new ValidationError(
          "Attendance file must be a .dat text export.",
          "INVALID_ATTENDANCE_FILE_TYPE",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

export const runAttendanceUpload = (req: Request, res: Response) => {
  return new Promise<void>((resolve, reject) => {
    upload.single("attendanceFile")(req, res, (error) => {
      if (!error) {
        resolve();
        return;
      }

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          req.log.warn(
            {
              requestId: req.requestId,
              path: req.originalUrl,
              fileField: error.field,
              sizeLimitBytes: maxAttendanceFileSizeBytes,
              failureReason: error.code,
            },
            "attendance upload rejected for file size",
          );
          reject(
            new ValidationError(
              `Attendance file must be ${maxAttendanceFileSizeBytes} bytes or smaller.`,
              "ATTENDANCE_FILE_TOO_LARGE",
            ),
          );
          return;
        }

        reject(new ValidationError(error.message, "INVALID_MULTIPART_REQUEST"));
        return;
      }

      reject(error);
    });
  });
};

export const getUploadedAttendanceFile = (req: Request): UploadedAttendanceFile => {
  const file = req.file;

  if (!file) {
    throw new ValidationError("Attendance file is required.", "MISSING_ATTENDANCE_FILE");
  }

  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    buffer: file.buffer,
  };
};
