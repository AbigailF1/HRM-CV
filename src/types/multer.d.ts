declare module "multer" {
  import type { Request, RequestHandler } from "express";

  export type File = {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };

  export class MulterError extends Error {
    code: string;
    field?: string;
    constructor(code: string, field?: string);
  }

  export type FileFilterCallback = {
    (error: Error): void;
    (error: null, acceptFile: boolean): void;
  };

  export type Options = {
    storage?: unknown;
    limits?: {
      fileSize?: number;
      files?: number;
    };
    fileFilter?: (
      req: Request,
      file: File,
      callback: FileFilterCallback,
    ) => void;
  };

  export type Multer = {
    single(fieldName: string): RequestHandler;
    any(): RequestHandler;
  };

  type MulterFactory = ((options?: Options) => Multer) & {
    memoryStorage(): unknown;
    MulterError: typeof MulterError;
  };

  const multer: MulterFactory;
  export default multer;
}
