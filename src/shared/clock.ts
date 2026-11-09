// The clock is injected into every module that reads the time (D14), so tests can
// control hourly sync (FR-010), the 15-minute retry and 24-hour cutoff (FR-018).

export interface Clock {
  /** Current instant. All stored times are UTC (D14). */
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
