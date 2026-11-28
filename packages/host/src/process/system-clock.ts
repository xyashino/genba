import type { ClockPort } from '../ports/clock.port.ts';

export const createSystemClock = (): ClockPort => ({
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
