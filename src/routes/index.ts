import type { FastifyPluginAsync } from "fastify";

import { telnyxWebhookRoute } from "./telnyx-webhook.route.js";

export const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(telnyxWebhookRoute);
};
