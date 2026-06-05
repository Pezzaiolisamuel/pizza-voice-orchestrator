const processedEventIds = new Set<string>();

// This must move to Redis or a database in production.
export function shouldProcessEvent(eventId: string): boolean {
  if (processedEventIds.has(eventId)) {
    return false;
  }

  processedEventIds.add(eventId);
  return true;
}
