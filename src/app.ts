import express from "express";

import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { env } from "./config/env.js";
import { router  } from "./router.js";
import { errorHandler, notFoundHandler } from "./shared/http/middleware/errors.js";
import { requestCompletionLogger, requestLogger } from "./shared/http/middleware/logging.js";
import { authLimiter } from "./shared/http/middleware/rateLimit.js";

export const createApp = () => {
  const app = express();

  if (env.rateLimit.trustProxyHops > 0) {
    app.set("trust proxy", env.rateLimit.trustProxyHops);
  }

  app.use(requestLogger);
  app.use(requestCompletionLogger);
  app.all("/api/auth/{*authRoute}", authLimiter, toNodeHandler(auth));

  app.use(express.json());
  app.use("/api/v1", router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
