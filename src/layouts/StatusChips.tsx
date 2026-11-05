import { useQuery } from '@tanstack/react-query';
import { timetableApi } from '@/api/endpoints';
import { activeActivation, mainPhases } from '@/lib/phases';
import { formatDate, todayKyiv } from '@/lib/time';
import { Chip } from '@/ui';
import { IconLayers, IconOk } from '@/ui/icons';

/** Рядок стану над сторінкою укладача: що діє зараз і що заплановано (як у прототипі). */
export function StatusChips() {
  const list = useQuery({ queryKey: ['timetables'], queryFn: timetableApi.list });
  const alert = useQuery({ queryKey: ['alert-plan'], queryFn: timetableApi.alertPlan });
  if (!list.data) return null;

  const today = todayKyiv();
  const { current, scheduled } = mainPhases(list.data, today);
  const activeAlert = activeActivation(alert.data?.activations ?? [], today);

  return (
    <div className="row" style={{ marginBottom: 16, gap: 6 }}>
      {activeAlert ? (
        <Chip tone="warn">
          <IconLayers width={14} height={14} />
          Діє: розклад тривог з {formatDate(activeAlert.from)}
        </Chip>
      ) : current ? (
        <Chip tone="ok">
          <IconOk width={14} height={14} />
          Діє: основний розклад з {formatDate(current.effective_from!)}
        </Chip>
      ) : (
        <Chip>Розклад ще не опубліковано</Chip>
      )}
      {scheduled && (
        <Chip tone="acc">Запланована версія з {formatDate(scheduled.effective_from!)}</Chip>
      )}
    </div>
  );
}
