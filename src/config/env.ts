import "dotenv/config";

import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();
const envBoolean = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url(),
  TELNYX_API_KEY: z.string().min(1),
  TELNYX_PUBLIC_KEY: optionalString,
  TELNYX_CONNECTION_ID: optionalString,
  TELNYX_PHONE_NUMBER: optionalString,
  TELNYX_VERIFY_SIGNATURE: envBoolean.default(false),
  DRY_RUN_TELNYX_COMMANDS: envBoolean.default(false),
  CAPTURE_MEDIA_METADATA: envBoolean.default(false),
  MEDIA_METADATA_SAMPLE_LIMIT: z.coerce.number().int().nonnegative().default(20),
  TELNYX_STREAM_TRACK: z.string().trim().min(1).default("inbound_track"),
  TELNYX_STREAM_CODEC: z.string().trim().min(1).default("PCMU"),
  AZURE_STT_ENABLED: envBoolean.default(false),
  AZURE_SPEECH_KEY: optionalString,
  AZURE_SPEECH_REGION: optionalString,
  AZURE_STT_LANGUAGE: z.string().trim().min(1).default("es-ES")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten());
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
