import { env } from "./config/env.js";
import { buildApp } from "./http/app.js";
import { buildTelnyxMediaWebSocketUrl } from "./telnyx/media-url.js";

let isShuttingDown = false;
let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function startServer() {
  try {
    const builtApp = await buildApp();
    app = builtApp;
    const localBaseUrl = `http://localhost:${env.PORT}`;
    const publicBaseUrl = new URL(env.PUBLIC_BASE_URL);
    const publicMediaUrl = buildTelnyxMediaWebSocketUrl(env.PUBLIC_BASE_URL);
    const publicWebhookUrl = new URL("/webhooks/telnyx", publicBaseUrl);

    await builtApp.listen({
      host: "0.0.0.0",
      port: env.PORT
    });

    builtApp.log.info(
      {
        nodeEnv: env.NODE_ENV,
        dryRunTelnyxCommands: env.DRY_RUN_TELNYX_COMMANDS,
        localBaseUrl,
        localHealthUrl: `${localBaseUrl}/health`,
        telnyxWebhookPath: "/webhooks/telnyx",
        telnyxMediaPath: "/telnyx/media",
        publicWebhookUrl: publicWebhookUrl.toString(),
        publicMediaUrl
      },
      "server listening with health and Telnyx endpoints"
    );
  } catch (error) {
    if (app) {
      app.log.error({ error }, "failed to start server");
    }
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown || !app) {
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
