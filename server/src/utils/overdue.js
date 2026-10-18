const DAY_MS = 86_400_000;

export function calculateOverdueDays(endDate, graceDays, today = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0;
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) return 0;
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.floor((current - end) / DAY_MS) - graceDays);
}

export function cutoffDate(today, graceDays) {
  const current = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(current) || !Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) return null;
  return new Date(current - graceDays * DAY_MS).toISOString().slice(0, 10);
}
