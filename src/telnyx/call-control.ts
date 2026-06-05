import { telnyxClient } from "./client.js";
import { env } from "../config/env.js";
import { buildTelnyxMediaWebSocketUrl } from "./media-url.js";
import { logger } from "../utils/logger.js";

export async function answerCall(
  callControlId: string,
  eventId?: string | null
) {
  const commandId = buildCommandId("answer", callControlId, eventId);

  if (env.DRY_RUN_TELNYX_COMMANDS) {
    logger.info(
      { callControlId, commandId, eventId },
      "dry run: would send Telnyx answer command"
    );

    return;
  }

  logger.info({ callControlId, commandId, eventId }, "sending Telnyx answer command");

  try {
    // Exact request body sent to Telnyx:
    // { command_id: "<deterministic-command-id>" }
    const response = await telnyxClient.calls.actions.answer(callControlId, {
      command_id: commandId
    });

    logger.info(
      { callControlId, commandId, eventId },
      "Telnyx answer command succeeded"
    );

    return response;
  } catch (error) {
    logger.error(
      {
        error,
        callControlId,
        commandId,
        eventId
      },
      "Telnyx answer command failed"
    );

    throw error;
  }
}

export async function startMediaStreaming(
  callControlId: string,
  eventId?: string | null
) {
  const streamUrl = buildStreamUrl();
  const parsedStreamUrl = new URL(streamUrl);
  const commandId = buildCommandId("streaming_start", callControlId, eventId);

  if (env.DRY_RUN_TELNYX_COMMANDS) {
    logger.info(
      {
        callControlId,
        streamUrl
      },
      "dry run: would send Telnyx streaming_start command"
    );

    return;
  }

  logger.info(
    {
      callControlId,
      commandId,
      eventId,
      streamHost: parsedStreamUrl.host,
      streamPath: parsedStreamUrl.pathname,
      streamTrack: env.TELNYX_STREAM_TRACK,
      streamCodec: env.TELNYX_STREAM_CODEC
    },
    "sending Telnyx streaming_start command"
  );

  try {
    // Exact request body sent to Telnyx:
    // {
    //   command_id: "<deterministic-command-id>",
    //   stream_url: "wss://<public-host>/telnyx/media",
    //   stream_track: "<env.TELNYX_STREAM_TRACK>",
    //   stream_codec: "<env.TELNYX_STREAM_CODEC>"
    // }
    const response = await telnyxClient.calls.actions.startStreaming(
      callControlId,
      {
        command_id: commandId,
        stream_url: streamUrl,
        stream_track: env.TELNYX_STREAM_TRACK as
          | "inbound_track"
          | "outbound_track"
          | "both_tracks",
        stream_codec: env.TELNYX_STREAM_CODEC as
          | "PCMU"
          | "PCMA"
          | "G722"
          | "OPUS"
      }
    );

    logger.info(
      {
        callControlId,
        commandId,
        eventId,
        streamHost: parsedStreamUrl.host,
        streamPath: parsedStreamUrl.pathname
      },
      "Telnyx streaming_start command succeeded"
    );

    return response;
  } catch (error) {
    logger.error(
      {
        error,
        callControlId,
        commandId,
        eventId,
        streamHost: parsedStreamUrl.host,
        streamPath: parsedStreamUrl.pathname
      },
      "Telnyx streaming_start command failed"
    );

    throw error;
  }
}

function buildStreamUrl() {
  return buildTelnyxMediaWebSocketUrl(env.PUBLIC_BASE_URL);
}

function buildCommandId(
  actionName: string,
  callControlId: string,
  eventId?: string | null
) {
  const safeActionName = sanitizeCommandIdPart(actionName);
  const safeCallControlId = sanitizeCommandIdPart(callControlId);
  const safeEventId = sanitizeCommandIdPart(eventId ?? "no-event-id");

  return `${safeActionName}:${safeCallControlId}:${safeEventId}`;
}

function sanitizeCommandIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "-");
}
