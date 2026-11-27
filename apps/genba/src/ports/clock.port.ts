export type ClockPort = {
  now(): number;
  sleep(ms: number): Promise<void>;
};
