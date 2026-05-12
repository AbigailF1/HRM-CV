import multer from "multer";
import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { ValidationError } from "../../shared/http/errors.js";
import type { UploadedCvFile } from "./cv-ranker.types.js";

const allowedCvMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: env.cvRanker.maxFiles,
    fileSize: env.cvRanker.maxFileSizeBytes,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedCvMimeTypes.has(file.mimetype)) {
      req.log.warn(
        {
          requestId: req.requestId,
          path: req.originalUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
          failureReason: "INVALID_CV_FILE_TYPE",
        },
        "cv ranker upload rejected for file type",
      );
      callback(
        new ValidationError("CV files must be PDF or DOCX files.", "INVALID_CV_FILE_TYPE"),
      );
      return;
    }

    callback(null, true);
  },
});

export const runCvRankerUpload = (req: Request, res: Response) => {
  return new Promise<void>((resolve, reject) => {
    upload.any()(req, res, (error) => {
      if (!error) {
        resolve();
        return;
      }

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          reject(
            new ValidationError(
              `Each CV must be ${env.cvRanker.maxFileSizeBytes} bytes or smaller.`,
              "CV_FILE_TOO_LARGE",
            ),
          );
          return;
        }

        if (error.code === "LIMIT_FILE_COUNT") {
          reject(
            new ValidationError(
              `At most ${env.cvRanker.maxFiles} CV files can be ranked at once.`,
              "TOO_MANY_CV_FILES",
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

export const getUploadedCvFiles = (req: Request): UploadedCvFile[] => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    throw new ValidationError("At least one CV file is required.", "MISSING_CV_FILES");
  }

  return files.map((file) => ({
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    buffer: file.buffer,
  }));
};
