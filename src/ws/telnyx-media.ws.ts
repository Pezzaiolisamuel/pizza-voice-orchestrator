import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData } from "ws";

import { env } from "../config/env.js";
import {
  createAzureSttSession,
  type AzureSttSession
} from "../services/azure-stt.service.js";

type TelnyxMediaMessage = {
  callSessionId?: unknown;
  call_session_id?: unknown;
  event?: unknown;
  sequenceNumber?: unknown;
  sequence_number?: unknown;
  start?: {
    callSessionId?: unknown;
    call_session_id?: unknown;
    streamId?: unknown;
    stream_id?: unknown;
  };
  streamId?: unknown;
  stream_id?: unknown;
  timestamp?: unknown;
  media?: {
    chunk?: unknown;
    payload?: unknown;
    timestamp?: unknown;
    track?: unknown;
  };
};

type MediaMetadataSample = {
  timestamp: string | number | null;
  event: string | null;
  sequenceNumber: string | number | null;
  streamId: string | null;
  chunk: string | number | null;
  payloadSize: number;
  track?: string;
};

type MediaMetadataCapture = {
  filePath: string;
  frames: MediaMetadataSample[];
  saving: boolean;
  saved: boolean;
};

const mediaMetadataDir = path.resolve(process.cwd(), "tmp");

export async function telnyxMediaWs(app: FastifyInstance) {
  app.get("/telnyx/media", { websocket: true }, (connection, request) => {
      let azureSttSession: AzureSttSession | null = null;
      const metadataSamples = new Map<string, MediaMetadataCapture>();
      const counters = {
        connectedFrames: 0,
        startFrames: 0,
        mediaFrames: 0,
        stopFrames: 0,
        errorFrames: 0,
        totalMediaBytes: 0
      };

      request.log.info(
        {
          requestId: request.id,
          client: request.ip
        },
        "Telnyx media websocket connected"
      );

      connection.on("message", (rawMessage: RawData) => {
        const text =
          typeof rawMessage === "string" ? rawMessage : rawMessage.toString("utf8");

        try {
          const parsed = JSON.parse(text) as TelnyxMediaMessage;
          const event = asString(parsed.event);
          const sequenceNumber =
            asString(parsed.sequence_number) ?? asString(parsed.sequenceNumber);
          const streamId =
            asString(parsed.stream_id) ??
            asString(parsed.streamId) ??
            asString(parsed.start?.stream_id) ??
            asString(parsed.start?.streamId);
          const callSessionId =
            asString(parsed.call_session_id) ??
            asString(parsed.callSessionId) ??
            asString(parsed.start?.call_session_id) ??
            asString(parsed.start?.callSessionId);

          if (event === "connected") {
            counters.connectedFrames += 1;
          } else if (event === "start") {
            counters.startFrames += 1;
            if (env.AZURE_STT_ENABLED && !azureSttSession) {
              const sttSessionId = streamId ?? callSessionId ?? request.id;
              try {
                azureSttSession = createAzureSttSession(sttSessionId);
                request.log.info(
                  {
                    requestId: request.id,
                    streamId,
                    callSessionId,
                    sttSessionId
                  },
                  "created Azure STT session for Telnyx media stream"
                );
              } catch (error) {
                request.log.error(
                  {
                    error,
                    requestId: request.id,
                    streamId,
                    callSessionId
                  },
                  "failed to create Azure STT session for Telnyx media stream"
                );
              }
            }
          } else if (event === "stop") {
            counters.stopFrames += 1;
            void closeAzureSttSession({
              request,
              session: azureSttSession,
              reason: "Telnyx media stop event",
              streamId,
              callSessionId
            });
            azureSttSession = null;
          } else if (event === "error") {
            counters.errorFrames += 1;
          }

          if (event === "media") {
            const payload = asString(parsed.media?.payload);
            const payloadSize = payload?.length ?? 0;
            counters.mediaFrames += 1;
            counters.totalMediaBytes += payloadSize;

            if (azureSttSession && payload) {
              const audioBuffer = Buffer.from(payload, "base64");
              azureSttSession.pushAudio(audioBuffer);
            }

            if (env.CAPTURE_MEDIA_METADATA && env.MEDIA_METADATA_SAMPLE_LIMIT > 0) {
              void captureMediaMetadata({
                event,
                payloadSize,
                request,
                sampleLimit: env.MEDIA_METADATA_SAMPLE_LIMIT,
                samples: metadataSamples,
                sequenceNumber:
                  asStringOrNumber(parsed.sequence_number) ??
                  asStringOrNumber(parsed.sequenceNumber),
                streamId,
                timestamp: asStringOrNumber(parsed.timestamp),
                media: parsed.media
              }).catch((error) => {
                request.log.warn(
                  {
                    error,
                    requestId: request.id,
                    streamId
                  },
                  "failed to save Telnyx media metadata sample"
                );
              });
            }

            if (counters.mediaFrames % 100 === 0) {
              request.log.info(
                {
                  event,
                  sequenceNumber,
                  streamId,
                  payloadSize,
                  ...counters
                },
                "received Telnyx media websocket progress"
              );
            }

            return;
          }

          request.log.info(
            {
              event,
              sequenceNumber,
              streamId,
              ...counters
            },
            "received Telnyx media websocket event"
          );
        } catch (error) {
          request.log.warn(
            {
              error,
              requestId: request.id
            },
            "failed to parse Telnyx media websocket message"
          );
        }
      });

      connection.on("close", (code: number, reasonBuffer: Buffer) => {
        void closeAzureSttSession({
          request,
          session: azureSttSession,
          reason: "Telnyx media websocket close"
        });
        azureSttSession = null;

        if (env.CAPTURE_MEDIA_METADATA) {
          for (const sample of metadataSamples.values()) {
            if (!sample.saved && sample.frames.length > 0) {
              void saveMediaMetadataSample(sample, request).catch((error) => {
                request.log.warn(
                  {
                    error,
                    requestId: request.id,
                    filePath: sample.filePath
                  },
                  "failed to save Telnyx media metadata sample"
                );
              });
            }
          }
        }

        request.log.info(
          {
            code,
            reason: reasonBuffer.toString(),
            requestId: request.id,
            ...counters
          },
          "Telnyx media websocket disconnected"
        );
      });

      connection.on("error", (error: Error) => {
        request.log.error(
          {
            error,
            requestId: request.id
          },
          "Telnyx media websocket error"
        );
      });
    });
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringOrNumber(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  return null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function captureMediaMetadata({
  event,
  payloadSize,
  request,
  sampleLimit,
  samples,
  sequenceNumber,
  streamId,
  timestamp,
  media
}: {
  event: string | null;
  payloadSize: number;
  request: FastifyRequest;
  sampleLimit: number;
  samples: Map<string, MediaMetadataCapture>;
  sequenceNumber: string | number | null;
  streamId: string | null;
  timestamp: string | number | null;
  media: TelnyxMediaMessage["media"];
}) {
  const sampleKey = streamId ?? "unknown";
  let sample = samples.get(sampleKey);

  if (!sample) {
    sample = {
      filePath: path.join(
        mediaMetadataDir,
        `telnyx-media-sample-${sanitizeFileSegment(sampleKey)}.json`
      ),
      frames: [],
      saving: false,
      saved: false
    };
    samples.set(sampleKey, sample);
  }

  if (sample.saved || sample.frames.length >= sampleLimit) {
    return;
  }

  const track = asOptionalString(media?.track);
  const frame: MediaMetadataSample = {
    timestamp: asStringOrNumber(media?.timestamp) ?? timestamp,
    event,
    sequenceNumber,
    streamId,
    chunk: asStringOrNumber(media?.chunk),
    payloadSize
  };

  if (track) {
    frame.track = track;
  }

  sample.frames.push(frame);

  if (sample.frames.length >= sampleLimit) {
    await saveMediaMetadataSample(sample, request);
  }
}

async function saveMediaMetadataSample(
  sample: MediaMetadataCapture,
  request: FastifyRequest
) {
  if (sample.saving || sample.saved) {
    return;
  }

  sample.saving = true;
  try {
    await mkdir(mediaMetadataDir, { recursive: true });
    await writeFile(sample.filePath, JSON.stringify(sample.frames, null, 2), "utf8");
    sample.saved = true;
  } finally {
    sample.saving = false;
  }

  request.log.info(
    {
      filePath: sample.filePath,
      frames: sample.frames.length
    },
    "saved Telnyx media metadata sample"
  );
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function closeAzureSttSession({
  request,
  session,
  reason,
  streamId,
  callSessionId
}: {
  request: FastifyRequest;
  session: AzureSttSession | null;
  reason: string;
  streamId?: string | null;
  callSessionId?: string | null;
}) {
  if (!session) {
    return;
  }

  try {
    await session.close();
    request.log.info(
      {
        requestId: request.id,
        reason,
        streamId,
        callSessionId
      },
      "closed Azure STT session for Telnyx media stream"
    );
  } catch (error) {
    request.log.warn(
      {
        error,
        requestId: request.id,
        reason,
        streamId,
        callSessionId
      },
      "failed to close Azure STT session for Telnyx media stream"
    );
  }
}
