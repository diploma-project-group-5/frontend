/**
 * Стан кабінету в sessionStorage (переживає оновлення сторінки, але не вкладку). Усі ключі — з
 * префіксом `lad.`, щоб вихід міг прибрати їх разом: інакше наступний користувач у тій самій
 * вкладці отримував опитування чужої задачі й «Попередню задачу побудови більше не знайдено».
 */
const PREFIX = 'lad.';

/** job_id активної побудови основного розкладу — окремо для кожного закладу. */
export const activeBuildJobKey = (schoolId: string | null) =>
  `${PREFIX}activeBuildJob:${schoolId ?? '-'}`;

export function clearSessionState() {
  try {
    for (const k of Object.keys(sessionStorage))
      if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch {
    /* приватний режим — нічого не збережено */
  }
}
