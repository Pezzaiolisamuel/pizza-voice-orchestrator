import { env } from "../config/env.js";

export interface TelnyxClient {
  apiKey: string;
  publicKey: string | undefined;
  publicBaseUrl: string;
  connectionId: string | undefined;
  phoneNumber: string | undefined;
  verifySignature: boolean;
  streamTrack: string;
  streamCodec: string;
}

export function createTelnyxClient(): TelnyxClient {
  return {
    apiKey: env.TELNYX_API_KEY,
    publicKey: env.TELNYX_PUBLIC_KEY,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    connectionId: env.TELNYX_CONNECTION_ID,
    phoneNumber: env.TELNYX_PHONE_NUMBER,
    verifySignature: env.TELNYX_VERIFY_SIGNATURE,
    streamTrack: env.TELNYX_STREAM_TRACK,
    streamCodec: env.TELNYX_STREAM_CODEC
  };
}
