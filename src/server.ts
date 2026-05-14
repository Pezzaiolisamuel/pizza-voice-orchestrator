import { env } from "./config/env.js";
import { buildApp } from "./http/app.js";

const app = buildApp();
let isShuttingDown = false;

async function startServer() {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT
    });

    app.log.info(
      {
        url: `http://localhost:${env.PORT}`,
        nodeEnv: env.NODE_ENV
      },
      "server listening"
    );
  } catch (error) {
    app.log.error({ error }, "failed to start server");
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  app.log.info({ signal }, "shutting down server");

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ error, signal }, "failed to shut down server cleanly");
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void startServer();
