import Fastify from "fastify";
import websocket from "@fastify/websocket";

import { healthRoute } from "../routes/health.route.js";
import { registerRoutes } from "../routes/index.js";
import { CallSessionRegistry } from "../services/call-session-registry.js";
import { TelnyxCallOrchestrator } from "../services/telnyx-call-orchestrator.js";
import { createTelnyxClient } from "../telnyx/client.js";
import { TelnyxCallControlCommands } from "../telnyx/commands.js";
import { logger } from "../utils/logger.js";
import { registerWebSocketHandlers } from "../ws/index.js";

export function buildApp() {
  const app = Fastify({
    loggerInstance: logger
  });

  const sessionRegistry = new CallSessionRegistry();
  const telnyxClient = createTelnyxClient();
  const telnyxCommands = new TelnyxCallControlCommands(telnyxClient);
  const orchestrator = new TelnyxCallOrchestrator({
    logger: app.log,
    sessionRegistry,
    telnyxCommands
  });

  app.decorate("sessionRegistry", sessionRegistry);
  app.decorate("orchestrator", orchestrator);

  app.register(websocket);
  app.register(healthRoute);
  app.register(registerRoutes, { prefix: "/v1" });
  app.register(registerWebSocketHandlers, { prefix: "/v1" });

  app.addHook("onClose", async () => {
    orchestrator.shutdown();
  });

  return app;
}
