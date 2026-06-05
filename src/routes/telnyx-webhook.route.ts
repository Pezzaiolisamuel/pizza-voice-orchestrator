import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { handleTelnyxWebhookEvent } from "../services/telnyx-orchestrator.service.js";
import { verifyTelnyxWebhookSignature } from "../telnyx/verify-webhook.js";

const telnyxWebhookSchema = z
  .object({
    data: z
      .object({
        id: z.string().optional(),
        event_type: z.string().optional(),
        occurred_at: z.string().optional(),
        payload: z
          .object({
            call_control_id: z.string().optional()
          })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional(),
    payload: z
      .object({
        data: z
          .object({
            payload: z
              .object({
                call_control_id: z.string().optional()
              })
              .passthrough()
              .optional()
          })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export const telnyxWebhookRoute: FastifyPluginAsync = async (app) => {
  app.post("/webhooks/telnyx", async (request, reply) => {
    const isValidSignature = verifyTelnyxWebhookSignature(
      request.rawBody ?? "",
      request.headers
    );

    if (!isValidSignature) {
      request.log.warn("invalid Telnyx webhook signature");
      return reply.code(401).send({ error: "invalid_signature" });
    }

    const parsedBody = telnyxWebhookSchema.safeParse(request.body);

    if (!parsedBody.success) {
      request.log.warn(
        { issues: parsedBody.error.flatten() },
        "received invalid Telnyx webhook payload"
      );

      return reply.code(400).send({ error: "invalid_payload" });
    }

    await handleTelnyxWebhookEvent(parsedBody.data, request.log);

    return reply.send({
      received: true
    });
  });
};
