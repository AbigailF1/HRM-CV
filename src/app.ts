import express from "express";

import { env } from "./config/env.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { router  } from "./router.js";
import { errorHandler, notFoundHandler } from "./shared/http/middleware/errors.js";

export const createApp = () => {
  const app = express();

  app.all("/api/auth/{*authRoute}", toNodeHandler(auth));

  app.use(express.json());
  app.use(env.uploads.publicPath, express.static(env.uploads.rootDir));
  app.use("/api/v1", router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
