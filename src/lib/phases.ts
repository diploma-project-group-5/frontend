import type { AlertActivation, TimetableSummary } from '@/api/types';
import { publishedPhase } from './time';

/** Чинна й запланована версії основного розкладу — обчислюються з effective_from (розділ 05). */
export function mainPhases(list: TimetableSummary[], today: string) {
  const published = list.filter((v) => v.state === 'published' && v.effective_from);
  const dates = published.map((v) => v.effective_from!);
  return {
    current: published.find((v) => publishedPhase(v.effective_from!, dates, today) === 'current'),
    scheduled: published.find(
      (v) => publishedPhase(v.effective_from!, dates, today) === 'scheduled',
    ),
  };
}

/** Активація розкладу тривог, що діє на дату: from ≤ дата < to (порожня to — діє далі). */
export function activeActivation(activations: AlertActivation[], today: string) {
  return activations.find((a) => a.from <= today && (!a.to || a.to > today));
}
