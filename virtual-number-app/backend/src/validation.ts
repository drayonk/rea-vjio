import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ProviderError } from "./telephony/types.js";

export const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +14155550123");

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Machine-readable reason the app can act on, e.g. opening the paywall. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** 402 that tells the app to show the paywall. */
export const upgradeRequired = (message: string) => new HttpError(402, message, "upgrade_required");

/** Wraps async handlers so rejections reach the error middleware. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? "invalid request" });
  } else if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  } else if (err instanceof ProviderError) {
    res.status(502).json({ error: `Carrier error: ${err.message}` });
  } else {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
}
