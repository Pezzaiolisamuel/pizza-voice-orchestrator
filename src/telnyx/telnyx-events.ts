export type TelnyxWebhookPayload = Record<string, unknown>;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getPayloadParts(payload: TelnyxWebhookPayload) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const nestedPayload = asRecord(data?.payload);
  const topLevelPayload = asRecord(root?.payload);
  const topLevelData = asRecord(topLevelPayload?.data);
  const topLevelDataPayload = asRecord(topLevelData?.payload);

  return {
    root,
    data,
    nestedPayload,
    topLevelPayload,
    topLevelData,
    topLevelDataPayload
  };
}

export function getEventId(payload: TelnyxWebhookPayload) {
  const { root, data, topLevelPayload } = getPayloadParts(payload);

  return (
    asString(data?.id) ??
    asString(root?.id) ??
    asString(topLevelPayload?.id) ??
    null
  );
}

export function getEventType(payload: TelnyxWebhookPayload) {
  const { root, data, topLevelPayload } = getPayloadParts(payload);

  return (
    asString(data?.event_type) ??
    asString(root?.event_type) ??
    asString(topLevelPayload?.event_type) ??
    null
  );
}

export function getOccurredAt(payload: TelnyxWebhookPayload) {
  const { root, data, topLevelPayload } = getPayloadParts(payload);

  return (
    asString(data?.occurred_at) ??
    asString(root?.occurred_at) ??
    asString(topLevelPayload?.occurred_at) ??
    null
  );
}

export function getCallControlId(payload: TelnyxWebhookPayload) {
  const { data, nestedPayload, topLevelPayload, topLevelDataPayload } =
    getPayloadParts(payload);

  return (
    asString(topLevelDataPayload?.call_control_id) ??
    asString(nestedPayload?.call_control_id) ??
    asString(data?.call_control_id) ??
    asString(topLevelPayload?.call_control_id) ??
    null
  );
}

export function getCallSessionId(payload: TelnyxWebhookPayload) {
  const { data, nestedPayload, topLevelPayload, topLevelDataPayload } =
    getPayloadParts(payload);

  return (
    asString(topLevelDataPayload?.call_session_id) ??
    asString(nestedPayload?.call_session_id) ??
    asString(data?.call_session_id) ??
    asString(topLevelPayload?.call_session_id) ??
    null
  );
}

export function getFrom(payload: TelnyxWebhookPayload) {
  const { data, nestedPayload, topLevelPayload, topLevelDataPayload } =
    getPayloadParts(payload);

  return (
    asString(topLevelDataPayload?.from) ??
    asString(nestedPayload?.from) ??
    asString(data?.from) ??
    asString(topLevelPayload?.from) ??
    null
  );
}

export function getTo(payload: TelnyxWebhookPayload) {
  const { data, nestedPayload, topLevelPayload, topLevelDataPayload } =
    getPayloadParts(payload);

  return (
    asString(topLevelDataPayload?.to) ??
    asString(nestedPayload?.to) ??
    asString(data?.to) ??
    asString(topLevelPayload?.to) ??
    null
  );
}

export function getDirection(payload: TelnyxWebhookPayload) {
  const { data, nestedPayload, topLevelPayload, topLevelDataPayload } =
    getPayloadParts(payload);

  return (
    asString(topLevelDataPayload?.direction) ??
    asString(nestedPayload?.direction) ??
    asString(data?.direction) ??
    asString(topLevelPayload?.direction) ??
    null
  );
}

export function getStreamId(payload: TelnyxWebhookPayload) {
  const { data, nestedPayload, topLevelPayload, topLevelDataPayload } =
    getPayloadParts(payload);

  return (
    asString(topLevelDataPayload?.stream_id) ??
    asString(topLevelDataPayload?.streamId) ??
    asString(nestedPayload?.stream_id) ??
    asString(nestedPayload?.streamId) ??
    asString(data?.stream_id) ??
    asString(data?.streamId) ??
    asString(topLevelPayload?.stream_id) ??
    asString(topLevelPayload?.streamId) ??
    null
  );
}
