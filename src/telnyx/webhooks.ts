import { z } from "zod";

const telnyxPayloadSchema = z.object({
  call_control_id: z.string(),
  call_leg_id: z.string().optional(),
  call_session_id: z.string(),
  client_state: z.string().optional(),
  connection_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export const telnyxCallControlWebhookSchema = z.object({
  data: z.object({
    event_type: z.string(),
    id: z.string(),
    occurred_at: z.string(),
    payload: telnyxPayloadSchema,
    record_type: z.string().optional()
  }),
  meta: z.record(z.unknown()).optional()
});

export type TelnyxCallControlWebhook = z.infer<
  typeof telnyxCallControlWebhookSchema
>;
