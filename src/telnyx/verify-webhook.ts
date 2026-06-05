import nacl from "tweetnacl";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

type HeaderValue = string | string[] | undefined;
type WebhookHeaders = Record<string, HeaderValue>;

let hasWarnedVerificationDisabled = false;

export function verifyTelnyxWebhookSignature(
  rawBody: string | Buffer,
  headers: WebhookHeaders
): boolean {
  if (!env.TELNYX_VERIFY_SIGNATURE) {
    if (!hasWarnedVerificationDisabled) {
      hasWarnedVerificationDisabled = true;
      logger.warn("Telnyx webhook signature verification is disabled");
    }

    return true;
  }

  if (!env.TELNYX_PUBLIC_KEY) {
    logger.error("TELNYX_PUBLIC_KEY is required when signature verification is enabled");
    return false;
  }

  const signatureHeader = getHeader(headers, "telnyx-signature-ed25519");
  const timestampHeader = getHeader(headers, "telnyx-timestamp");

  if (!signatureHeader || !timestampHeader) {
    logger.warn("Missing Telnyx signature headers");
    return false;
  }

  const publicKey = decodeKey(env.TELNYX_PUBLIC_KEY);
  const signature = decodeKey(signatureHeader);

  if (!publicKey || !signature) {
    logger.warn("Invalid Telnyx signature key material");
    return false;
  }

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedPayload = `${timestampHeader}|${body}`;
  const message = Buffer.from(signedPayload, "utf8");

  return nacl.sign.detached.verify(message, signature, publicKey);
}

function getHeader(headers: WebhookHeaders, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) {
    return value[0];
  }

  return undefined;
}

function decodeKey(value: string): Uint8Array | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const base64Bytes = decodeBase64(normalized);

  if (base64Bytes) {
    return base64Bytes;
  }

  const hexBytes = decodeHex(normalized);

  if (hexBytes) {
    return hexBytes;
  }

  return null;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const buffer = Buffer.from(value, "base64");
    return buffer.length > 0 ? new Uint8Array(buffer) : null;
  } catch {
    return null;
  }
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
    return null;
  }

  try {
    const buffer = Buffer.from(value, "hex");
    return buffer.length > 0 ? new Uint8Array(buffer) : null;
  } catch {
    return null;
  }
}
