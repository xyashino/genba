import type { ClockPort } from '../../ports/clock.port.js';

export const createSystemClock = (): ClockPort => ({
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
