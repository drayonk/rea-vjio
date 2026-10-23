import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ProviderError } from "./telephony/types.js";

export const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +14155550123");

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof ProviderError) {
    res.status(502).json({ error: `Carrier error: ${err.message}` });
  } else {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
}
