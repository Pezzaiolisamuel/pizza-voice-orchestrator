import type { FastifyPluginAsync } from "fastify";

import {
  type TelnyxCallControlWebhook,
  telnyxCallControlWebhookSchema
} from "../telnyx/webhooks.js";

export const telnyxRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: TelnyxCallControlWebhook }>(
    "/telnyx/webhooks/call-control",
    async (request, reply) => {
      const parsedBody = telnyxCallControlWebhookSchema.safeParse(request.body);

      if (!parsedBody.success) {
        request.log.warn(
          { issues: parsedBody.error.flatten() },
          "received invalid Telnyx webhook payload"
        );

        return reply.code(400).send({ error: "invalid_payload" });
      }

      await app.orchestrator.handleWebhook(parsedBody.data, request.log);

      return reply.code(202).send({ accepted: true });
    }
  );
};
