import Fastify from "fastify";
import websocket from "@fastify/websocket";

import { healthRoute } from "../routes/health.route.js";
import { telnyxWebhookRoute } from "../routes/telnyx-webhook.route.js";
import { CallSessionRegistry } from "../services/call-session-registry.js";
import { TelnyxCallOrchestrator } from "../services/telnyx-call-orchestrator.js";
import { telnyxClient } from "../telnyx/client.js";
import { TelnyxCallControlCommands } from "../telnyx/commands.js";
import { logger } from "../utils/logger.js";
import { attachRawBody } from "../utils/raw-body.js";
import { telnyxMediaWs } from "../ws/telnyx-media.ws.js";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger
  });

  app.addContentTypeParser(
    /^application\/(.+\+)?json(;.*)?$/i,
    { parseAs: "string" },
    (request, body, done) => {
      const rawBody = typeof body === "string" ? body : body.toString("utf8");

      attachRawBody(request, rawBody);

      try {
        const parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : {};
        done(null, parsedBody);
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

    request.log.error(
      {
        error,
        requestId: request.id,
        method: request.method,
        url: request.url
      },
      "request failed"
    );

    return reply.code(statusCode).send({
      error: "internal_server_error"
    });
  });

  const sessionRegistry = new CallSessionRegistry();
  const telnyxCommands = new TelnyxCallControlCommands(telnyxClient);
  const orchestrator = new TelnyxCallOrchestrator({
    logger: app.log,
    sessionRegistry,
    telnyxCommands
  });

  app.decorate("sessionRegistry", sessionRegistry);
  app.decorate("orchestrator", orchestrator);

  await app.register(websocket);
  await app.register(telnyxMediaWs);
  app.log.info("registered route GET /telnyx/media websocket");
  await app.register(healthRoute);
  await app.register(telnyxWebhookRoute);

  app.addHook("onClose", async () => {
    orchestrator.shutdown();
  });

  return app;
}
