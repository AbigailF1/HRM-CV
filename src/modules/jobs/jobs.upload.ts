import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";

import multer from "multer";
import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { NotFoundError, ValidationError } from "../../shared/http/errors.js";
import type { SavedResumeFile, UploadedResume } from "./jobs.types.js";

const allowedResumeMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: env.uploads.maxResumeFileSizeBytes,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedResumeMimeTypes.has(file.mimetype)) {
      req.log.warn(
        {
          requestId: req.requestId,
          path: req.originalUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          failureReason: "INVALID_RESUME_FILE_TYPE",
        },
        "resume upload rejected for file type",
      );
      callback(
        new ValidationError(
          "Resume must be a PDF, DOC, or DOCX file.",
          "INVALID_RESUME_FILE_TYPE",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

const sanitizeFileName = (fileName: string) => {
  const fileExtension = extname(fileName).toLowerCase();
  const baseName = basename(fileName, fileExtension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${baseName || "resume"}${fileExtension}`;
};

const buildResumeStorageKey = (fileName: string) => {
  return `${Date.now()}-${randomUUID()}-${sanitizeFileName(fileName)}`;
};

export const resolveResumeStoragePath = (storageKey: string) => {
  const normalizedStorageKey = storageKey.trim();

  if (!normalizedStorageKey) {
    throw new NotFoundError("Resume file not found.", "RESUME_FILE_NOT_FOUND");
  }

  const storagePath = resolve(env.uploads.resumesDir, normalizedStorageKey);
  const relativePath = relative(env.uploads.resumesDir, storagePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new NotFoundError("Resume file not found.", "RESUME_FILE_NOT_FOUND");
  }

  return storagePath;
};

export const runResumeUpload = (req: Request, res: Response) => {
  return new Promise<void>((resolve, reject) => {
    upload.single("resume")(req, res, (error) => {
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
              sizeLimitBytes: env.uploads.maxResumeFileSizeBytes,
              failureReason: error.code,
            },
            "resume upload rejected for file size",
          );
          reject(
            new ValidationError(
              `Resume must be ${env.uploads.maxResumeFileSizeBytes} bytes or smaller.`,
              "RESUME_FILE_TOO_LARGE",
            ),
          );
          return;
        }

        req.log.warn(
          {
            requestId: req.requestId,
            path: req.originalUrl,
            fileField: error.field,
            failureReason: error.code,
          },
          "multipart upload request failed",
        );
        reject(new ValidationError(error.message, "INVALID_MULTIPART_REQUEST"));
        return;
      }

      req.log.warn(
        {
          requestId: req.requestId,
          path: req.originalUrl,
          fileName: req.file?.originalname,
          mimeType: req.file?.mimetype,
          sizeBytes: req.file?.size,
          failureReason: error instanceof Error ? error.message : "unknown upload failure",
        },
        "resume upload rejected",
      );
      reject(error);
    });
  });
};

export const getUploadedResume = (req: Request): UploadedResume => {
  const file = req.file;

  if (!file) {
    throw new ValidationError("Resume file is required.", "MISSING_RESUME_FILE");
  }

  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    buffer: file.buffer,
  };
};

export const saveResumeFile = async (resume: UploadedResume): Promise<SavedResumeFile> => {
  try {
    await mkdir(env.uploads.resumesDir, { recursive: true });

    const storageKey = buildResumeStorageKey(resume.originalName);
    const storagePath = resolveResumeStoragePath(storageKey);

    await writeFile(storagePath, resume.buffer);

    return {
      storageKey,
      storagePath,
      fileName: resume.originalName,
      mimeType: resume.mimeType,
      sizeBytes: resume.sizeBytes,
    };
  } catch (error) {
    logger.error(
      {
        fileName: resume.originalName,
        mimeType: resume.mimeType,
        sizeBytes: resume.sizeBytes,
        err: error instanceof Error ? error : undefined,
      },
      "failed to persist uploaded resume",
    );
    throw error;
  }
};

export const deleteSavedResumeFile = async (storagePath: string) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await unlink(storagePath);
      return;
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;

      if (errorCode === "ENOENT") {
        return;
      }

      if ((errorCode === "EPERM" || errorCode === "EBUSY") && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }

      logger.error(
        {
          storagePath,
          attempt: attempt + 1,
          err: error instanceof Error ? error : undefined,
        },
        "failed to delete saved resume file",
      );
      throw error;
    }
  }
};
