import pino from "pino";

import { env } from "../config/env.js";

const level = process.env.LOG_LEVEL ?? "info";
const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers['x-api-key']",
    "req.headers['telnyx-signature-ed25519']",
    "req.headers['telnyx-timestamp']",
    "*.authorization",
    "*.apiKey",
    "*.publicKey",
    "*.secret",
    "*.token"
  ],
  censor: "[REDACTED]"
};

export const logger =
  env.NODE_ENV === "development"
    ? pino({
        level,
        redact,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      })
    : pino({
        level,
        redact
      });
