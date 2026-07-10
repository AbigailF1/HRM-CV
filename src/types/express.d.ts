import type { auth } from "../lib/auth.js";
import type { File as MulterFile } from "multer";
import type { Logger } from "pino";

type AuthSession = (typeof auth)["$Infer"]["Session"];

declare global {
  namespace Express {
    interface Request {
      auth?: AuthSession;
      file?: MulterFile;
      files?: MulterFile[] | Record<string, MulterFile[]>;
      log: Logger;
      requestId: string;
    }
  }
}

export {};
