import Telnyx from "telnyx";

import { env } from "../config/env.js";

export const telnyxClient = new Telnyx({
  apiKey: env.TELNYX_API_KEY
});

export type TelnyxClient = typeof telnyxClient;
