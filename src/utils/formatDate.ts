/**
 * Site-wide date formatting. Every date a reader sees goes through here, so
 * the format is decided once: "Jul 4, 2025".
 *
 * The locale and the time zone are fixed. Pages are rendered at build time, so
 * a format that follows the machine would follow the CI runner, not the
 * reader — and a date-only value like `2025-07-04` parses as midnight UTC,
 * which a runner west of Greenwich would print as July 3.
 */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const day = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
// A full timestamp is a moment, and Congress keeps Eastern time.
const moment = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

/**
 * @param dateStr - `2025-07-04`, or a full ISO timestamp
 * @returns "Jul 4, 2025"; `N/A` for nothing; the input itself when unparseable
 */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return (DAY_ONLY.test(dateStr) ? day : moment).format(date);
}

/**
 * A wall-clock time as Congress records it: `14:31:00` → "2:31 PM".
 * The data carries no zone — it is already Eastern — so none is applied.
 *
 * @returns The formatted time, or an empty string when there is none to show
 */
export function formatTime(timeStr: string | undefined | null): string {
  const match = /^(\d{2}):(\d{2})/.exec(timeStr ?? '');
  if (!match) return '';
  return clock.format(new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2]))));
}
