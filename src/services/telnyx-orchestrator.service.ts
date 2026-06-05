import type { FastifyBaseLogger } from "fastify";

import {
  addSafeError,
  attachStreamId,
  CallState,
  createOrUpdateSessionFromTelnyxEvent,
  endSession,
  transitionCallState,
  type CallSession,
  type SafeCallError
} from "../calls/callSessionStore.js";
import { writeCallSummary } from "../calls/callSummaryWriter.js";
import { shouldProcessEvent } from "./idempotency.service.js";
import { answerCall, startMediaStreaming } from "../telnyx/call-control.js";
import {
  getCallControlId,
  getCallSessionId,
  getDirection,
  getEventId,
  getEventType,
  getStreamId,
  type TelnyxWebhookPayload
} from "../telnyx/telnyx-events.js";

export async function handleTelnyxWebhookEvent(
  event: TelnyxWebhookPayload,
  logger: FastifyBaseLogger
) {
  const telnyxEventId = getEventId(event);
  const eventType = getEventType(event);
  const callControlId = getCallControlId(event);
  const callSessionId = getCallSessionId(event);
  const direction = getDirection(event);
  const streamId = getStreamId(event);
  const correlation = {
    telnyx_event_id: telnyxEventId,
    event_type: eventType,
    call_control_id: callControlId,
    call_session_id: callSessionId
  };

  if (telnyxEventId && !shouldProcessEvent(telnyxEventId)) {
    logger.info(
      {
        ...correlation
      },
      "duplicate Telnyx webhook ignored"
    );

    return;
  }

  const session = createOrUpdateSessionFromTelnyxEvent(event);

  logger.info(
    {
      ...correlation,
      direction,
      stream_id: streamId,
      session: summarizeSessionForLog(session)
    },
    "received Telnyx webhook"
  );

  if (
    eventType === "call.initiated" &&
    direction === "incoming" &&
    callControlId
  ) {
    if (callSessionId) {
      const answeringSession = transitionCallState(
        callSessionId,
        CallState.CALL_ANSWERING
      );
      logSessionState(logger, "Telnyx call state transition", answeringSession);
    }

    logger.info(
      {
        ...correlation,
        direction,
        session: summarizeSessionForLog(session)
      },
      "answering incoming Telnyx call"
    );

    try {
      await answerCall(callControlId, telnyxEventId);
    } catch (error) {
      if (callSessionId) {
        const safeError = toSafeCallError("telnyx.answer", error);
        addSafeError(callSessionId, safeError);
        logSessionState(
          logger,
          "Telnyx answer command failed and call session marked ERROR",
          session
        );
      }

      throw error;
    }

    logger.info(
      {
        ...correlation,
        direction,
        session: summarizeSessionForLog(session)
      },
      "answered incoming Telnyx call"
    );

    return;
  }

  if (eventType === "call.answered" && callControlId) {
    if (callSessionId) {
      const streamingStartingSession = transitionCallState(
        callSessionId,
        CallState.STREAMING_STARTING
      );
      logSessionState(
        logger,
        "Telnyx call state transition",
        streamingStartingSession
      );
    }

    logger.info(
      {
        ...correlation,
        session: summarizeSessionForLog(session)
      },
      "streaming_start_requested"
    );

    try {
      await startMediaStreaming(callControlId, telnyxEventId);
    } catch (error) {
      if (callSessionId) {
        const safeError = toSafeCallError("telnyx.streaming_start", error);
        addSafeError(callSessionId, safeError);
        logSessionState(
          logger,
          "Telnyx streaming_start command failed and call session marked ERROR",
          session
        );
      }

      throw error;
    }

    logger.info(
      {
        ...correlation,
        session: summarizeSessionForLog(session)
      },
      "streaming_start_success"
    );

    return;
  }

  if (eventType === "streaming.started") {
    const updatedSession =
      callSessionId && streamId ? attachStreamId(callSessionId, streamId) : session;

    logger.info(
      {
        ...correlation,
        stream_id: streamId,
        session: summarizeSessionForLog(updatedSession)
      },
      "received Telnyx streaming lifecycle event"
    );

    return;
  }

  if (eventType === "streaming.stopped") {
    if (callSessionId) {
      const stoppedSession = transitionCallState(
        callSessionId,
        CallState.STREAMING_STOPPED
      );
      logSessionState(logger, "Telnyx call state transition", stoppedSession);
    }

    logger.info(
      {
        ...correlation,
        stream_id: streamId,
        session: summarizeSessionForLog(session)
      },
      "received Telnyx streaming lifecycle event"
    );

    return;
  }

  if (eventType === "streaming.failed") {
    if (callSessionId) {
      const safeError: SafeCallError = {
        timestamp: new Date().toISOString(),
        source: "telnyx.streaming",
        message: "Telnyx streaming failed"
      };
      addSafeError(callSessionId, safeError);
    }

    logger.info(
      {
        ...correlation,
        stream_id: streamId,
        session: summarizeSessionForLog(session)
      },
      "received Telnyx streaming lifecycle event"
    );

    return;
  }

  if (eventType === "call.hangup" && callSessionId) {
    const endedSession = endSession(callSessionId);

    if (endedSession) {
      const summaryPath = await writeCallSummary(endedSession);
      logger.info(
        {
          ...correlation,
          summary_path: summaryPath,
          session: summarizeSessionForLog(endedSession)
        },
        "wrote Telnyx call summary"
      );
    }

    return;
  }

  logger.info(
    {
      ...correlation,
      session: summarizeSessionForLog(session)
    },
    "processed Telnyx webhook with no action"
  );
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
    transcriptCount: session.finalTranscripts.length
  };
}

function logSessionState(
  logger: FastifyBaseLogger,
  message: string,
  session: CallSession | null
) {
  if (!session) {
    return;
  }

  logger.info({ session: summarizeSessionForLog(session) }, message);
}

function toSafeCallError(source: string, error: unknown): SafeCallError {
  const safeError: SafeCallError = {
    timestamp: new Date().toISOString(),
    source,
    message: getErrorMessage(error)
  };

  const code = getErrorCode(error);

  if (code) {
    safeError.code = code;
  }

  return safeError;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
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
