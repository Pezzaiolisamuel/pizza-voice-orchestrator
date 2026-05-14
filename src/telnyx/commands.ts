import type { TelnyxClient } from "./client.js";

export class TelnyxCallControlCommands {
  constructor(private readonly client: TelnyxClient) {}

  getPublicBaseUrl() {
    return this.client.publicBaseUrl;
  }
}
