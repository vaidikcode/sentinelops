export class DuplicateEventError extends Error {
  readonly eventId: string;

  constructor(eventId: string) {
    super(`Event ${eventId} is already recorded`);
    this.name = "DuplicateEventError";
    this.eventId = eventId;
  }
}
