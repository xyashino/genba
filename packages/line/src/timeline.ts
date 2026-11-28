import { z } from 'zod';

const DETAIL_CHARS = 200;
const COLUMNS = {
  time: 8,
  cell: 8,
  order: 20,
  station: 14,
  action: 18,
} as const;
const RESET = '\u001b[0m';
const STYLE = {
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  blue: '\u001b[34m',
  cyan: '\u001b[36m',
} as const;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
// Details quote command and agent output, which must not drive the terminal.
const CONTROL = /\p{Cc}+/gu;
const BAD = /fail|crash|error|blocked/;
const GOOD = /passed|delivered|pr$/;
const STARTING = /claim|start/;

export const timelineEntrySchema = z.object({
  at: z.string(),
  cell: z.string(),
  order: z.string().optional(),
  station: z.string().optional(),
  job: z.string().optional(),
  action: z.string(),
  detail: z.string().optional(),
});

export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

export type TimelineFilter = { cell?: string; order?: string };

const printable = (text: string): string =>
  text.replace(ANSI, '').replace(CONTROL, ' ');

export const timelineLineOf = (entry: TimelineEntry): string =>
  `${JSON.stringify({
    ...entry,
    detail: entry.detail?.split('\n')[0]?.slice(0, DETAIL_CHARS),
  })}\n`;

/** Null for a line still being written. */
export const parseTimelineLine = (line: string): TimelineEntry | null => {
  try {
    return timelineEntrySchema.parse(JSON.parse(line));
  } catch {
    return null;
  }
};

export const matchesFilter = (
  entry: TimelineEntry,
  { cell, order }: TimelineFilter,
): boolean =>
  (cell === undefined || entry.cell === cell) &&
  (order === undefined || entry.order === order);

const toneOf = (action: string): keyof typeof STYLE => {
  if (BAD.test(action)) return 'red';
  if (GOOD.test(action)) return 'green';
  return STARTING.test(action) ? 'blue' : 'cyan';
};

const cell = (text: string, width: number): string =>
  printable(text).slice(0, width).padEnd(width);

export const renderHeader = (
  filter: TimelineFilter,
  color: boolean,
): string => {
  const scope =
    filter.order !== undefined
      ? `order: ${filter.order}`
      : (filter.cell ?? 'all cells');
  const columns = [
    ...Object.entries(COLUMNS).map(([name, width]) =>
      name.toUpperCase().padEnd(width),
    ),
    'DETAIL',
  ].join(' ');
  const title = `GENBA | ${printable(scope)}`;
  return [
    color ? `${STYLE.bold}${title}${RESET}` : title,
    '-'.repeat(columns.length),
    columns,
  ].join('\n');
};

export const renderEntry = (entry: TimelineEntry, color: boolean): string => {
  const paint = (style: keyof typeof STYLE, text: string): string =>
    color ? `${STYLE[style]}${text}${RESET}` : text;
  return [
    paint('dim', cell(entry.at.slice(11, 19), COLUMNS.time)),
    cell(entry.cell, COLUMNS.cell),
    paint('dim', cell(entry.order ?? '-', COLUMNS.order)),
    paint('bold', cell(entry.station ?? '-', COLUMNS.station)),
    paint(toneOf(entry.action), cell(entry.action, COLUMNS.action)),
    printable(entry.detail ?? '').slice(0, DETAIL_CHARS),
  ]
    .join(' ')
    .trimEnd();
};
