/**
 * Bir xil telefon raqami uchun ovoz-yaratish (check-then-create) ketma-ketligini
 * process ichida qat'iy serializatsiya qiladi.
 *
 * SABAB: `Vote.phone` ustida bazada UNIQUE cheklov yo'q — himoya faqat kod
 * darajasidagi "avval mavjudligini tekshirish, keyin yaratish" mantig'iga
 * tayanadi. Bu ikki qadam orasida boshqa so'rov ham xuddi shu telefon bilan
 * kirib kelsa (masalan, Mini App va bot-chat orqali deyarli bir vaqtda, yoki
 * ikkita tab), ikkalasi ham "mavjud emas" deb topib, IKKITA alohida
 * PENDING_VERIFICATION yozuv yaratishi mumkin edi — bu esa keyinchalik
 * avtomatik-tasdiqlovchi orqali BITTA haqiqiy ovoz uchun IKKI marta pul
 * to'lanishiga olib kelishi mumkin. Butun ilova bitta Node jarayonida
 * ishlagani uchun (docker-compose'da bitta orchestrator konteyner), oddiy
 * in-memory navbat butun muammoni yopadi — DB migratsiyasi shart emas.
 */
const phoneLockChain = new Map<string, Promise<unknown>>();

export function withPhoneLock<T>(phone: string, fn: () => Promise<T>): Promise<T> {
  const key = String(phone || '').replace(/\D/g, '') || 'unknown';
  const prior = phoneLockChain.get(key) || Promise.resolve();
  const run = prior.then(fn, fn);
  const chained = run.catch(() => {});
  phoneLockChain.set(key, chained);
  run.finally(() => {
    if (phoneLockChain.get(key) === chained) phoneLockChain.delete(key);
  });
  return run;
}
