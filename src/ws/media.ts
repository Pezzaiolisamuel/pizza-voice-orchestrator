import type { FastifyPluginAsync } from "fastify";
import type { RawData, WebSocket } from "ws";

interface MediaSocketQuerystring {
  callSessionId?: string;
}

export const mediaWebSocketRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: MediaSocketQuerystring }>(
    "/telnyx/ws/media",
    { websocket: true },
    async (socket, request) => {
      const { callSessionId } = request.query;

      request.log.info(
        {
          callSessionId: callSessionId ?? null,
          client: request.ip
        },
        "telnyx media websocket connected"
      );

      app.orchestrator.attachMediaSocket({
        socket,
        requestId: request.id,
        callSessionId
      });

      socket.on("message", (rawMessage: RawData) => {
        handleSocketMessage(app, socket, rawMessage, callSessionId, request.id);
      });

      socket.on("close", (code: number, reasonBuffer: Buffer) => {
        app.orchestrator.detachMediaSocket({
          requestId: request.id,
          callSessionId
        });

        request.log.info(
          {
            callSessionId: callSessionId ?? null,
            code,
            reason: reasonBuffer.toString()
          },
          "telnyx media websocket disconnected"
        );
      });

      socket.on("error", (error: Error) => {
        request.log.error(
          { error, callSessionId: callSessionId ?? null },
          "telnyx media websocket error"
        );
      });
    }
  );
};

function handleSocketMessage(
  app: Parameters<FastifyPluginAsync>[0],
  socket: WebSocket,
  rawMessage: RawData,
  callSessionId: string | undefined,
  requestId: string
) {
  try {
    const text = typeof rawMessage === "string" ? rawMessage : rawMessage.toString();
    const payload = JSON.parse(text) as unknown;

    app.orchestrator.handleMediaEvent({
      socket,
      requestId,
      callSessionId,
      payload
    });
  } catch (error) {
    app.log.warn(
      {
        error,
        requestId,
        callSessionId: callSessionId ?? null
      },
      "failed to parse websocket payload"
    );

    socket.send(JSON.stringify({ type: "error", reason: "invalid_json" }));
  }
}
