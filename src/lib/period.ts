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

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// 今週（月曜はじまり）の7日分の日付
export function currentWeekDates(now: Date = new Date()): string[] {
  const today = todayInJapan(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = 日曜
  const monday = addDays(today, weekday === 0 ? -6 : 1 - weekday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
