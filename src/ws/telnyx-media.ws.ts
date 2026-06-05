import type { FastifyInstance } from "fastify";
import type { RawData } from "ws";

type TelnyxMediaMessage = {
  event?: unknown;
  sequence_number?: unknown;
  stream_id?: unknown;
  media?: {
    payload?: unknown;
  };
};

export async function telnyxMediaWs(app: FastifyInstance) {
  app.get("/telnyx/media", { websocket: true }, (connection, request) => {
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
          const sequenceNumber = asString(parsed.sequence_number);
          const streamId = asString(parsed.stream_id);

          if (event === "connected") {
            counters.connectedFrames += 1;
          } else if (event === "start") {
            counters.startFrames += 1;
          } else if (event === "stop") {
            counters.stopFrames += 1;
          } else if (event === "error") {
            counters.errorFrames += 1;
          }

          if (event === "media") {
            const payloadSize = asString(parsed.media?.payload)?.length ?? 0;
            counters.mediaFrames += 1;
            counters.totalMediaBytes += payloadSize;

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
