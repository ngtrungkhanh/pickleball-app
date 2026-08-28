type SeasonDisplayMeta = {
  active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
};

type SeasonTimeTextInput = {
  selectedSeason: string | null;
  activeSeason: string;
  season?: SeasonDisplayMeta | null;
  matchDates: Array<string | null | undefined>;
};

function validTime(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatShortDate(time: number) {
  if (time <= 0) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(time));
}

export function getSeasonTimeText({
  selectedSeason,
  activeSeason,
  season,
  matchDates,
}: SeasonTimeTextInput) {
  const times = matchDates.map(validTime).filter(time => time > 0).sort((a, b) => a - b);
  const firstMatchTime = times[0] || 0;
  const lastMatchTime = times[times.length - 1] || 0;

  if (selectedSeason === null) {
    const first = formatShortDate(firstMatchTime);
    const last = formatShortDate(lastMatchTime);
    if (first && last && first !== last) return `${first} - ${last}`;
    return first || 'Chưa có dữ liệu';
  }

  const startTime = validTime(season?.start_date) || firstMatchTime;
  const start = formatShortDate(startTime);
  const isCompleted = selectedSeason !== activeSeason && season?.active !== true;
  const storedEndTime = isCompleted ? validTime(season?.end_date) : 0;
  const end = formatShortDate(Math.max(storedEndTime, lastMatchTime, startTime));

  if (start && end && start !== end) return `${start} - ${end}`;
  return start || end || 'Chưa có dữ liệu';
}
