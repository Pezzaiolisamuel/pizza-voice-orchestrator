import type { TelnyxClient } from "./client.js";
import { env } from "../config/env.js";

export class TelnyxCallControlCommands {
  constructor(private readonly client: TelnyxClient) {}

  getPublicBaseUrl() {
    void this.client;
    return env.PUBLIC_BASE_URL;
  }
}
