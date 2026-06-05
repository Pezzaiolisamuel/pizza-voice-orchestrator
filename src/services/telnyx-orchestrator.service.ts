import type { FastifyBaseLogger } from "fastify";

import { shouldProcessEvent } from "./idempotency.service.js";
import { answerCall, startMediaStreaming } from "../telnyx/call-control.js";
import {
  getCallControlId,
  getCallSessionId,
  getDirection,
  getEventId,
  getEventType,
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

  logger.info(
    {
      ...correlation,
      direction
    },
    "received Telnyx webhook"
  );

  if (
    eventType === "call.initiated" &&
    direction === "incoming" &&
    callControlId
  ) {
    logger.info(
      {
        ...correlation,
        direction
      },
      "answering incoming Telnyx call"
    );

    await answerCall(callControlId, telnyxEventId);

    logger.info(
      {
        ...correlation,
        direction
      },
      "answered incoming Telnyx call"
    );

    return;
  }

  if (eventType === "call.answered" && callControlId) {
    logger.info(
      {
        ...correlation
      },
      "streaming_start_requested"
    );

    await startMediaStreaming(callControlId, telnyxEventId);

    logger.info(
      {
        ...correlation
      },
      "streaming_start_success"
    );

    return;
  }

  if (
    eventType === "streaming.started" ||
    eventType === "streaming.stopped" ||
    eventType === "streaming.failed"
  ) {
    logger.info(
      {
        ...correlation
      },
      "received Telnyx streaming lifecycle event"
    );

    return;
  }

  logger.info(correlation, "processed Telnyx webhook with no action");
}
