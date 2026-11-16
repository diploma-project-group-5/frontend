import type { DayFormat, LoadReason } from '@/api/types';

/**
 * Пояснення формату класо-дня з GET /timetables/{id}/load (`class_days[].reason`). Значення —
 * з contracts 0.4.1 (`validation.outcome.v1.json`); причина лише пояснює, вердикт не змінює.
 * Дистанційний день оцінюють так, ніби клас прийшов очно разом зі своєю групою вчителів (класи,
 * що цього дня мають спільних вчителів). Нові значення можуть з'явитися в MINOR-версіях, тож для
 * невідомого коду — запасний текст, без сирого коду на екрані.
 */
const TEXT: Record<DayFormat, Partial<Record<LoadReason, string>>> = {
  in_person: {
    priority: 'клас має пріоритет очного навчання або цього дня має урок пріоритетної галузі',
    capacity_available: 'місця в укритті вистачило',
  },
  remote: {
    day_limit:
      'разом із класами, що цього дня мають спільних вчителів, клас не вмістився в ліміт укриття',
    capacity_available: 'місце в укритті було, але цей день не обрано очним',
    no_shelter: 'у групи класу є урок, що не проводиться в укритті (розклад тривог)',
    no_lessons: 'цього дня в класу немає уроків',
  },
};

const FALLBACK = 'пояснення причини поки немає';

export function reasonText(format: DayFormat, reason: string | undefined): string {
  if (!reason) return FALLBACK;
  return TEXT[format][reason as LoadReason] ?? FALLBACK;
}
