import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";

import multer from "multer";
import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { NotFoundError, ValidationError } from "../../shared/http/errors.js";
import type { SavedCvFile, UploadedCvFile } from "./cv-ranker.types.js";

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

const sanitizeFileName = (fileName: string) => {
  const fileExtension = extname(fileName).toLowerCase();
  const baseName = basename(fileName, fileExtension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${baseName || "cv"}${fileExtension}`;
};

const buildCvStorageKey = (fileName: string) => {
  return `${Date.now()}-${randomUUID()}-${sanitizeFileName(fileName)}`;
};

export const resolveCvStoragePath = (storageKey: string) => {
  const normalizedStorageKey = storageKey.trim();

  if (!normalizedStorageKey) {
    throw new NotFoundError("CV file not found.", "CV_FILE_NOT_FOUND");
  }

  const storagePath = resolve(env.cvRanker.filesDir, normalizedStorageKey);
  const relativePath = relative(env.cvRanker.filesDir, storagePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new NotFoundError("CV file not found.", "CV_FILE_NOT_FOUND");
  }

  return storagePath;
};

export const saveCvFile = async (file: UploadedCvFile): Promise<SavedCvFile> => {
  try {
    await mkdir(env.cvRanker.filesDir, { recursive: true });

    const storageKey = buildCvStorageKey(file.originalName);
    const storagePath = resolveCvStoragePath(storageKey);

    await writeFile(storagePath, file.buffer);

    return {
      storageKey,
      storagePath,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
  } catch (error) {
    logger.error(
      {
        fileName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        err: error instanceof Error ? error : undefined,
      },
      "failed to persist cv ranker upload",
    );
    throw error;
  }
};

export const readSavedCvFile = async (input: {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number | null;
}): Promise<UploadedCvFile> => {
  const storagePath = resolveCvStoragePath(input.storageKey);

  try {
    const buffer = await readFile(storagePath);

    return {
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? buffer.length,
      buffer,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError("CV file not found.", "CV_FILE_NOT_FOUND");
    }

    throw error;
  }
};

export const deleteSavedCvFile = async (storagePath: string) => {
  try {
    await unlink(storagePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};
