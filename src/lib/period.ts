// 日付と四半期の計算。日付は日本時間で扱う（サーバーは UTC で動くため、Intl で日本時間の日付に直す）
const TIME_ZONE = "Asia/Tokyo";
const DAY_MS = 24 * 60 * 60 * 1000;

export type YearQuarter = { year: number; quarter: number };

// 日本時間の今日（YYYY-MM-DD）
export function todayInJapan(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function currentYearQuarter(now: Date = new Date()): YearQuarter {
  const [year, month] = todayInJapan(now).split("-").map(Number);
  return { year, quarter: Math.floor((month - 1) / 3) + 1 };
}

// 「10月〜12月」
export function quarterMonths(quarter: number): string {
  const first = (quarter - 1) * 3 + 1;
  return `${first}月〜${first + 2}月`;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// その日を含む週の月曜日
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = 日曜
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

// 月曜日から7日分の日付
export function weekDatesFrom(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// 今週（月曜はじまり）の7日分の日付
export function currentWeekDates(now: Date = new Date()): string[] {
  return weekDatesFrom(mondayOf(todayInJapan(now)));
}

// 次の四半期（Q4 の次は翌年の Q1）
export function nextQuarter({ year, quarter }: YearQuarter): YearQuarter {
  return quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };
}

// 「10/26〜11/1」
export function formatWeek(monday: string): string {
  const end = addDays(monday, 6);
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${md(monday)}〜${md(end)}`;
}
