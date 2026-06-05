import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData } from "ws";

import {
  addSafeError,
  attachStreamId,
  CallState,
  getSessionByCallControlId,
  getSessionByCallSessionId,
  incrementMediaStats,
  transitionCallState,
  type CallSession,
  type SafeCallError
} from "../calls/callSessionStore.js";
import { env } from "../config/env.js";
import {
  createAzureSttSession,
  type AzureSttSession
} from "../services/azure-stt.service.js";

type TelnyxMediaMessage = {
  callControlId?: unknown;
  call_control_id?: unknown;
  callSessionId?: unknown;
  call_session_id?: unknown;
  event?: unknown;
  sequenceNumber?: unknown;
  sequence_number?: unknown;
  start?: {
    callControlId?: unknown;
    call_control_id?: unknown;
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
      let activeCallSessionId: string | null = null;
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
          const callControlId =
            asString(parsed.call_control_id) ??
            asString(parsed.callControlId) ??
            asString(parsed.start?.call_control_id) ??
            asString(parsed.start?.callControlId);
          const callControlSession = callControlId
            ? getSessionByCallControlId(callControlId)
            : null;
          activeCallSessionId =
            callSessionId ?? callControlSession?.callSessionId ?? activeCallSessionId;

          if (event === "connected") {
            counters.connectedFrames += 1;
          } else if (event === "start") {
            counters.startFrames += 1;
            const startSession = updateSessionForMediaStart({
              callSessionId: activeCallSessionId,
              streamId,
              azureSttSession
            });

            if (startSession) {
              request.log.info(
                {
                  requestId: request.id,
                  streamId,
                  session: summarizeSessionForLog(startSession)
                },
                "updated call session from Telnyx media start event"
              );
            }

            if (env.AZURE_STT_ENABLED && !azureSttSession) {
              const sttSessionId = activeCallSessionId ?? streamId ?? request.id;
              try {
                azureSttSession = createAzureSttSession(sttSessionId);
                request.log.info(
                  {
                    requestId: request.id,
                    streamId,
                    callSessionId: activeCallSessionId,
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
                    callSessionId: activeCallSessionId
                  },
                  "failed to create Azure STT session for Telnyx media stream"
                );
                addSafeMediaWebSocketError(
                  activeCallSessionId,
                  withOptionalCode(
                    "Failed to create Azure STT session",
                    getErrorCode(error)
                  )
                );
              }
            }
          } else if (event === "stop") {
            counters.stopFrames += 1;
            const stoppedSession = activeCallSessionId
              ? transitionCallState(
                  activeCallSessionId,
                  CallState.STREAMING_STOPPED
                )
              : null;

            if (stoppedSession) {
              request.log.info(
                {
                  requestId: request.id,
                  streamId,
                  session: summarizeSessionForLog(stoppedSession)
                },
                "updated call session from Telnyx media stop event"
              );
            }

            void closeAzureSttSession({
              request,
              session: azureSttSession,
              reason: "Telnyx media stop event",
              streamId,
              callSessionId: activeCallSessionId
            });
            azureSttSession = null;
          } else if (event === "error") {
            counters.errorFrames += 1;
            addSafeMediaWebSocketError(activeCallSessionId, {
              message: "Telnyx media websocket error event"
            });
          }

          if (event === "media") {
            const payload = asString(parsed.media?.payload);
            const payloadSize = payload?.length ?? 0;
            const audioBuffer = payload ? Buffer.from(payload, "base64") : null;
            const mediaBytes = audioBuffer?.byteLength ?? 0;
            counters.mediaFrames += 1;
            counters.totalMediaBytes += mediaBytes;

            if (activeCallSessionId) {
              incrementMediaStats(activeCallSessionId, mediaBytes);
            }

            if (azureSttSession && audioBuffer) {
              if (activeCallSessionId) {
                transitionCallState(activeCallSessionId, CallState.TRANSCRIBING);
              }
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
                  mediaBytes,
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
        if (shouldRecordWebSocketCloseError(code, counters.stopFrames)) {
          addSafeMediaWebSocketError(activeCallSessionId, {
            message: "Telnyx media websocket closed before Telnyx media stop",
            code: String(code)
          });
        }

        void closeAzureSttSession({
          request,
          session: azureSttSession,
          reason: "Telnyx media websocket close",
          callSessionId: activeCallSessionId
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
            callSessionId: activeCallSessionId,
            closeWasExpected: !shouldRecordWebSocketCloseError(
              code,
              counters.stopFrames
            ),
            ...counters
          },
          "Telnyx media websocket disconnected"
        );
      });

      connection.on("error", (error: Error) => {
        addSafeMediaWebSocketError(
          activeCallSessionId,
          withOptionalCode(error.message, getErrorCode(error))
        );

        request.log.error(
          {
            error: {
              message: error.message,
              name: error.name
            },
            requestId: request.id,
            callSessionId: activeCallSessionId
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

function updateSessionForMediaStart({
  callSessionId,
  streamId,
  azureSttSession
}: {
  callSessionId: string | null;
  streamId: string | null;
  azureSttSession: AzureSttSession | null;
}) {
  if (!callSessionId) {
    return null;
  }

  if (streamId) {
    attachStreamId(callSessionId, streamId);
  }

  const currentSession = getSessionByCallSessionId(callSessionId);

  if (currentSession?.state === CallState.TRANSCRIBING) {
    return currentSession;
  }

  return transitionCallState(
    callSessionId,
    azureSttSession ? CallState.TRANSCRIBING : CallState.STREAMING_STARTED
  );
}

function addSafeMediaWebSocketError(
  callSessionId: string | null,
  input: {
    message: string;
    code?: string;
  }
) {
  if (!callSessionId) {
    return null;
  }

  const safeError: SafeCallError = {
    timestamp: new Date().toISOString(),
    source: "telnyx_media_websocket",
    message: input.message
  };

  if (input.code) {
    safeError.code = input.code;
  }

  return addSafeError(callSessionId, safeError);
}

function withOptionalCode(message: string, code: string | undefined) {
  return code ? { message, code } : { message };
}

function summarizeSessionForLog(session: CallSession | null) {
  if (!session) {
    return null;
  }

  return {
    callSessionId: session.callSessionId,
    callControlId: session.callControlId,
    state: session.state,
    mediaFrames: session.mediaFrames,
    totalMediaBytes: session.totalMediaBytes,
    transcriptCount: session.finalTranscripts.length
  };
}

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { code?: unknown; statusCode?: unknown }).code;
  const statusCode = (error as { code?: unknown; statusCode?: unknown }).statusCode;

  if (typeof code === "string") {
    return code;
  }

  if (typeof statusCode === "number" || typeof statusCode === "string") {
    return String(statusCode);
  }

  return undefined;
}

function shouldRecordWebSocketCloseError(code: number, stopFrames: number) {
  if (stopFrames === 0) {
    return true;
  }

  return isAbnormalWebSocketCloseCode(code);
}

function isAbnormalWebSocketCloseCode(code: number) {
  return ![1000, 1001, 1005].includes(code);
}
