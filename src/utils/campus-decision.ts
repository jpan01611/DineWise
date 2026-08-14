import type { CampusSpot } from '@/context/dining-plan-context';

export type SpotStatus = {
  spot: CampusSpot;
  isOpenNow: boolean;
  minutesUntilClose: number | null;
  walkMinutes: number | null;
};

const CLOCK_PATTERN = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;

export function parseClockMinutes(value: string): number | null {
  const match = CLOCK_PATTERN.exec(value || '');
  if (!match) return null;

  let hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23) return null;

  return hour * 60 + minute;
}

export function evaluateSpot(spot: CampusSpot, nowMinutes: number): SpotStatus {
  const opens = parseClockMinutes(spot.opensAt);
  const closes = parseClockMinutes(spot.closesAt);
  const walk = Number.parseInt(spot.walkMinutes, 10);
  const walkMinutes = Number.isFinite(walk) ? walk : null;

  if (opens === null || closes === null) {
    return { spot, isOpenNow: false, minutesUntilClose: null, walkMinutes };
  }

  // Handle windows that run past midnight, e.g. 17:00 to 01:00.
  const overnight = closes <= opens;
  const isOpenNow = overnight
    ? nowMinutes >= opens || nowMinutes < closes
    : nowMinutes >= opens && nowMinutes < closes;

  let minutesUntilClose: number | null = null;
  if (isOpenNow) {
    minutesUntilClose = closes - nowMinutes;
    if (minutesUntilClose <= 0) minutesUntilClose += 24 * 60;
  }

  return { spot, isOpenNow, minutesUntilClose, walkMinutes };
}

export function rankOpenSpots(spots: CampusSpot[], nowMinutes: number): SpotStatus[] {
  return spots
    .map((spot) => evaluateSpot(spot, nowMinutes))
    .filter((status) => status.isOpenNow)
    .sort((a, b) => {
      // Plan-covered options first, then the shortest walk, then the most time before closing.
      if (a.spot.coveredByPlan !== b.spot.coveredByPlan) return a.spot.coveredByPlan ? -1 : 1;
      const walkA = a.walkMinutes ?? Number.MAX_SAFE_INTEGER;
      const walkB = b.walkMinutes ?? Number.MAX_SAFE_INTEGER;
      if (walkA !== walkB) return walkA - walkB;
      return (b.minutesUntilClose ?? 0) - (a.minutesUntilClose ?? 0);
    });
}

export function formatMinutesUntilClose(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `closes in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `closes in ${hours}h ${rest}m` : `closes in ${hours}h`;
}
