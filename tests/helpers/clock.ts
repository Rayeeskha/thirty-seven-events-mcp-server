/** Controllable time source so token-expiry tests need no sleeping. */
export class FakeClock {
  static readonly START = new Date('2026-11-08T12:00:00.000Z');

  private current = FakeClock.START;
  private tickMilliseconds = 0;

  /** Arrow property so it can be passed directly as a Clock. */
  now = (): Date => {
    const value = new Date(this.current);
    this.current = new Date(this.current.getTime() + this.tickMilliseconds);
    return value;
  };

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  /**
   * Makes every call to now() return a later time than the previous one, like a real clock.
   * A frozen clock hides races: two concurrent writers would store identical timestamps.
   */
  autoAdvance(secondsPerCall: number): void {
    this.tickMilliseconds = secondsPerCall * 1000;
  }

  reset(): void {
    this.current = FakeClock.START;
    this.tickMilliseconds = 0;
  }
}
