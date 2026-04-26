import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import multer from "multer";
import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { ValidationError } from "../../shared/http/errors.js";
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
  fileFilter: (_req, file, callback) => {
    if (!allowedResumeMimeTypes.has(file.mimetype)) {
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

export const runResumeUpload = (req: Request, res: Response) => {
  return new Promise<void>((resolve, reject) => {
    upload.single("resume")(req, res, (error) => {
      if (!error) {
        resolve();
        return;
      }

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          reject(
            new ValidationError(
              `Resume must be ${env.uploads.maxResumeFileSizeBytes} bytes or smaller.`,
              "RESUME_FILE_TOO_LARGE",
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
  await mkdir(env.uploads.resumesDir, { recursive: true });

  const storedFileName = `${Date.now()}-${randomUUID()}-${sanitizeFileName(resume.originalName)}`;
  const storagePath = join(env.uploads.resumesDir, storedFileName);

  await writeFile(storagePath, resume.buffer);

  return {
    storagePath,
    fileName: resume.originalName,
    fileUrl: `${env.auth.origin}${env.uploads.resumesPublicPath}/${storedFileName}`,
    mimeType: resume.mimeType,
    sizeBytes: resume.sizeBytes,
  };
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

      throw error;
    }
  }
};
