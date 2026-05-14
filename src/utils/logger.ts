import pino from "pino";

import { env } from "../config/env.js";

const level = process.env.LOG_LEVEL ?? "info";

export const logger =
  env.NODE_ENV === "development"
    ? pino({
        level,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      })
    : pino({ level });
