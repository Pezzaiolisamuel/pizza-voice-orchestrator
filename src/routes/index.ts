import type { FastifyPluginAsync } from "fastify";

import { telnyxRoutes } from "./telnyx.js";

export const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(telnyxRoutes);
};
