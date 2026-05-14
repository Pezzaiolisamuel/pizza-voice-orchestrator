import { env } from "../config/env.js";
import { buildApp } from "./app.js";

export async function startServer() {
  const app = buildApp();

  try {
    await app.listen({ port: env.PORT });

    app.log.info(
      {
        port: env.PORT,
        nodeEnv: env.NODE_ENV
      },
      "server listening"
    );
  } catch (error) {
    app.log.error({ error }, "failed to start server");
    process.exitCode = 1;
  }
}
