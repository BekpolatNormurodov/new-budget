export const formatSum = (val?: number | string): string => {
  if (val === undefined || val === null) return '0';
  const num = typeof val === 'string' ? parseInt(val.replace(/[^0-9]/g, ''), 10) || 0 : val;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const formatMoney = (val?: number | string): string => {
  return `${formatSum(val)} so'm`;
};

// Ovoz berish davri Toshkent vaqti bilan yuritiladi (UTC+5).
// Backend createdAt ni UTC ISO ko'rinishida yuboradi, shuning uchun filter va
// ekrandagi sana mos kelishi uchun har doim Asia/Tashkent zonasiga o'giramiz.
const TASHKENT_TZ = 'Asia/Tashkent';

// ISO timestamp (yoki Date) -> "YYYY-MM-DD" Toshkent vaqti bo'yicha.
export const toTashkentDateStr = (value?: string | number | Date | null): string => {
  if (!value) return '';
  let d: Date;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes('T')) {
      d = new Date(`${trimmed}Z`);
    } else if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes(' ')) {
      d = new Date(`${trimmed.replace(' ', 'T')}Z`);
    } else {
      d = new Date(trimmed);
    }
  } else {
    d = value instanceof Date ? value : new Date(value);
  }
  if (isNaN(d.getTime())) return '';

  // en-CA locale YYYY-MM-DD formatini beradi
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
};

// Toshkent vaqti bilan bugungi sana "YYYY-MM-DD".
export const tashkentToday = (): string => toTashkentDateStr(new Date());

// Toshkent vaqti bilan kechagi sana "YYYY-MM-DD".
export const tashkentYesterday = (): string =>
  toTashkentDateStr(new Date(Date.now() - 86400000));

// Universal O'zbekiston telefon raqami formati: +998 90 123-45-67
export const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  const clean = String(phone).replace(/\D/g, '');
  const p9 = clean.length >= 9 ? clean.slice(-9) : clean;
  if (p9.length === 9) {
    return `+998 ${p9.slice(0, 2)} ${p9.slice(2, 5)}-${p9.slice(5, 7)}-${p9.slice(7, 9)}`;
  }
  return clean ? `+${clean}` : '-';
};

// Sana va Vaqtni har doim O'zbekiston/Toshkent vaqti bo'yicha (UTC+5) to'g'ri ko'rsatish
export const formatTashkentDateTime = (value?: string | number | Date | null): string => {
  if (!value) return '-';
  let d: Date;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes('T')) {
      d = new Date(`${trimmed}Z`);
    } else if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes(' ')) {
      d = new Date(`${trimmed.replace(' ', 'T')}Z`);
    } else {
      d = new Date(trimmed);
    }
  } else {
    d = value instanceof Date ? value : new Date(value);
  }
  if (isNaN(d.getTime())) return String(value);

  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: TASHKENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
};

export const formatTashkentTime = (value?: string | number | Date | null): string => {
  if (!value) return '-';
  let d: Date;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes('T')) {
      d = new Date(`${trimmed}Z`);
    } else if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes(' ')) {
      d = new Date(`${trimmed.replace(' ', 'T')}Z`);
    } else {
      d = new Date(trimmed);
    }
  } else {
    d = value instanceof Date ? value : new Date(value);
  }
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: TASHKENT_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

// Ixcham format: "20:22  23/08"
export const formatShortDateTime = (value?: string | number | Date | null): string => {
  if (!value) return '-';
  let d: Date;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes('T')) {
      d = new Date(`${trimmed}Z`);
    } else if (!trimmed.includes('Z') && !trimmed.includes('+') && trimmed.includes(' ')) {
      d = new Date(`${trimmed.replace(' ', 'T')}Z`);
    } else {
      d = new Date(trimmed);
    }
  } else {
    d = value instanceof Date ? value : new Date(value);
  }
  if (isNaN(d.getTime())) return '-';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TASHKENT_TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';

  return `${hour}:${minute}  ${day}/${month}`;
};
