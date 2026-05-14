import type { FastifyPluginAsync } from "fastify";

import { mediaWebSocketRoutes } from "./media.js";

export const registerWebSocketHandlers: FastifyPluginAsync = async (app) => {
  await app.register(mediaWebSocketRoutes);
};
