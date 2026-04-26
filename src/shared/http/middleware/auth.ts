import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../../../lib/auth.js";
import { UnauthorizedError } from "../errors.js";

export const requireAdminSession = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      throw new UnauthorizedError("Authentication is required.");
    }

    req.auth = session;
    next();
  } catch (error) {
    next(error);
  }
};
