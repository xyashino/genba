export const DELIVER_STATION = 'deliver';
export const MECHANIC_STATION = 'mechanic';
export const ESCALATE_STATION = 'escalate';
const SIDE_STATIONS: readonly string[] = [MECHANIC_STATION, ESCALATE_STATION];

export const isSideStation = (stationId: string): boolean =>
  SIDE_STATIONS.includes(stationId);
