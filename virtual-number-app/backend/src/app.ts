import express from "express";
import { requireAuth } from "./auth.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { PushSender } from "./push.js";
import { authRoutes } from "./routes/auth.js";
import { callRoutes } from "./routes/calls.js";
import { meRoutes } from "./routes/me.js";
import { messageRoutes } from "./routes/messages.js";
import { numberRoutes } from "./routes/numbers.js";
import { webhookRoutes } from "./routes/webhooks.js";
import type { TelephonyProvider } from "./telephony/types.js";
import { errorHandler } from "./validation.js";

export interface Deps {
  db: Db;
  config: Config;
  telephony: TelephonyProvider;
  push: PushSender;
}

export function createApp(deps: Deps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/webhooks", webhookRoutes(deps));

  const api = express.Router();
  api.use(express.json({ limit: "64kb" }));
  api.use("/auth", authRoutes(deps));
  api.use(requireAuth(deps.config.authSecret));
  api.use("/me", meRoutes(deps));
  api.use("/numbers", numberRoutes(deps));
  api.use("/numbers/:numberId", messageRoutes(deps));
  api.use("/numbers/:numberId", callRoutes(deps));
  app.use("/api", api);

  app.use(errorHandler);
  return app;
}
