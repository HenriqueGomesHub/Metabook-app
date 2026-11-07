const parse = (day: string) => {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const part = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('en-GB', options);

/** "7–16 Nov 2026", "28 Oct – 3 Nov 2026" or "28 Dec 2026 – 3 Jan 2027" for YYYY-MM-DD days. */
export function formatDayRange(from: string, to: string): string {
  const start = parse(from);
  const end = parse(to);
  const full = (date: Date) => part(date, { day: 'numeric', month: 'short', year: 'numeric' });
  if (start.getFullYear() !== end.getFullYear()) return `${full(start)} – ${full(end)}`;
  if (start.getMonth() !== end.getMonth()) {
    return `${part(start, { day: 'numeric', month: 'short' })} – ${full(end)}`;
  }
  if (start.getDate() === end.getDate()) return full(end);
  return `${start.getDate()}–${full(end)}`;
}
