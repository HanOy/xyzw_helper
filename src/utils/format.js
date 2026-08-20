export function formatPower(value) {
  if (value == null) return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return String(Math.floor(n));
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function isNowInLegionWarTime(date = new Date()) {
  const d = date.getDay();
  const h = date.getHours();
  if (d === 0 || d === 6) return h >= 20 || h < 1;
  return false;
}