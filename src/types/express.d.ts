import type { auth } from "../lib/auth.js";
import type { File as MulterFile } from "multer";

type AuthSession = (typeof auth)["$Infer"]["Session"];

declare global {
  namespace Express {
    interface Request {
      auth?: AuthSession;
      file?: MulterFile;
    }
  }
}

export {};
