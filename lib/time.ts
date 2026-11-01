/**
 * Time & Timezone Utilities (`lib/time.ts`)
 * Times are stored in UTC and displayed in US Pacific / California Time (`America/Los_Angeles`, PT).
 */

const usDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
});

const usTimeOnlyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
});

const usDateOnlyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const californiaDayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function formatIST(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '—';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '—';
  return `${usDateTimeFormatter.format(date)} PT`;
}

export function formatISTTime(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '—';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '—';
  return `${usTimeOnlyFormatter.format(date)} PT`;
}

export function formatISTDate(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '—';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '—';
  return usDateOnlyFormatter.format(date);
}

/**
 * Returns the YYYY-MM-DD date key in California time (`America/Los_Angeles`).
 * Resets at 12:00 AM California time.
 */
export function getCaliforniaDateKey(date: Date = new Date()): string {
  return californiaDayKeyFormatter.format(date);
}

/**
 * Returns seconds remaining until the next 12:00 AM midnight in California (`America/Los_Angeles`).
 */
export function getSecondsUntilCaliforniaMidnight(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const second = Number(parts.find((p) => p.type === 'second')?.value ?? '0');

  const elapsedSecondsToday = hour * 3600 + minute * 60 + second;
  return Math.max(1, 86400 - elapsedSecondsToday);
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const mins = Math.floor(rounded / 60);
  const remSec = rounded % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}
