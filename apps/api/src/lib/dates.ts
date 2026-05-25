export function nowIso() {
  return new Date().toISOString();
}

export function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function displayDate(input?: string | null) {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.valueOf())) return input;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
