import type { FastifyBaseLogger } from "fastify";
import type { WebSocket } from "ws";

import type { TelnyxCallControlWebhook } from "../telnyx/webhooks.js";
import type { TelnyxCallControlCommands } from "../telnyx/commands.js";
import type { CallSessionRegistry } from "./call-session-registry.js";

interface OrchestratorDependencies {
  logger: FastifyBaseLogger;
  sessionRegistry: CallSessionRegistry;
  telnyxCommands: TelnyxCallControlCommands;
}

interface AttachMediaSocketInput {
  socket: WebSocket;
  requestId: string;
  callSessionId: string | undefined;
}

interface DetachMediaSocketInput {
  requestId: string;
  callSessionId: string | undefined;
}

interface HandleMediaEventInput {
  socket: WebSocket;
  requestId: string;
  callSessionId: string | undefined;
  payload: unknown;
}

export class TelnyxCallOrchestrator {
  constructor(private readonly deps: OrchestratorDependencies) {}

  async handleWebhook(
    event: TelnyxCallControlWebhook,
    logger: FastifyBaseLogger
  ): Promise<void> {
    const payload = event.data.payload;

    this.deps.sessionRegistry.upsert({
      callControlId: payload.call_control_id,
      callSessionId: payload.call_session_id,
      connectionId: payload.connection_id,
      websocketRequestId: undefined,
      mediaSocket: undefined,
      lastEventType: event.data.event_type,
      updatedAt: event.data.occurred_at
    });

    logger.info(
      {
        eventType: event.data.event_type,
        callControlId: payload.call_control_id,
        callSessionId: payload.call_session_id,
        publicBaseUrl: this.deps.telnyxCommands.getPublicBaseUrl()
      },
      "orchestrator accepted call control event"
    );

    if (event.data.event_type === "call.hangup") {
      this.deps.sessionRegistry.delete(payload.call_session_id);
      logger.info(
        { callSessionId: payload.call_session_id },
        "removed call session after hangup"
      );
    }
  }

  attachMediaSocket(input: AttachMediaSocketInput) {
    if (!input.callSessionId) {
      this.deps.logger.warn(
        { requestId: input.requestId },
        "websocket connected without callSessionId"
      );
      return;
    }

    this.deps.sessionRegistry.attachSocket(
      input.callSessionId,
      input.requestId,
      input.socket
    );
  }

  detachMediaSocket(input: DetachMediaSocketInput) {
    if (!input.callSessionId) {
      return;
    }

    this.deps.sessionRegistry.detachSocket(input.callSessionId, input.requestId);
  }

  handleMediaEvent(input: HandleMediaEventInput) {
    this.deps.logger.debug(
      {
        requestId: input.requestId,
        callSessionId: input.callSessionId ?? null,
        payload: input.payload
      },
      "received Telnyx media event"
    );

    input.socket.send(
      JSON.stringify({
        type: "ack",
        requestId: input.requestId
      })
    );
  }

  shutdown() {
    this.deps.sessionRegistry.clear();
  }
}
