import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { timetableApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { AlertPlan, Warnings } from '@/api/types';
import { isTerminal, JOB_STATE_LABEL, useJob } from '@/api/useJob';
import { activeActivation, mainPhases } from '@/lib/phases';
import { addDaysIso, formatDate, todayKyiv } from '@/lib/time';
import {
  Badge,
  Button,
  Card,
  Chip,
  Field,
  Notice,
  PageHeader,
  ProblemNotice,
  Spinner,
  Stack,
} from '@/ui';
import { IconLayers, IconOk } from '@/ui/icons';
import s from './ScenariosPage.module.css';

/**
 * «Сценарії» (прототип): звичайний розклад (модель 1.1) і розклад тривог (модель 1.2).
 * API: /alert-plan, :build, :approve, :activate, activations/{id}:end, /alert-hours (розділ 10).
 */
export function ScenariosPage() {
  const list = useQuery({ queryKey: ['timetables'], queryFn: timetableApi.list });
  const plan = useQuery({ queryKey: ['alert-plan'], queryFn: timetableApi.alertPlan });

  if (plan.isPending || list.isPending) return <Spinner />;
  if (!plan.data || !list.data) return <ProblemNotice error={plan.error ?? list.error} />;

  const today = todayKyiv();
  const active = activeActivation(plan.data.activations, today);
  const { current } = mainPhases(list.data, today);

  return (
    <>
      <PageHeader title="Сценарії" />
      <Stack>
        <AlertHoursCard />
        <div className={s.cols}>
          <Card>
            <div className={s.head}>
              <h3>Звичайний</h3>
              {active ? (
                <Chip>не діє</Chip>
              ) : (
                <Chip tone="ok">
                  <IconOk width={14} height={14} />
                  діє зараз
                </Chip>
              )}
            </div>
            <dl className={s.dl}>
              <dt>Версія</dt>
              <dd>
                {current ? (
                  <Link to={`/scheduler/timetables/${current.timetable_id}`}>
                    {current.timetable_id.slice(0, 8)}
                  </Link>
                ) : (
                  'не опубліковано'
                )}
              </dd>
              <dt>Модель</dt>
              <dd>1.1 · очно з переходом в укриття під час тривоги</dd>
              <dt>Діє з</dt>
              <dd>{current?.effective_from ? formatDate(current.effective_from) : '—'}</dd>
            </dl>
            {active && <EndActivation activationId={active.activation_id} from={active.from} />}
          </Card>

          <AlertPlanCard plan={plan.data} activeNow={!!active} />
        </div>
      </Stack>
    </>
  );
}

function AlertPlanCard({ plan, activeNow }: { plan: AlertPlan; activeNow: boolean }) {
  const today = todayKyiv();
  const future = plan.activations.filter((a) => a.from > today);
  const locked = activeNow || future.length > 0;

  return (
    <Card>
      <div className={s.head}>
        <h3>Тривоги</h3>
        {activeNow ? (
          <Chip tone="warn">
            <IconLayers width={14} height={14} />
            діє зараз
          </Chip>
        ) : plan.state === 'approved' ? (
          <Chip tone="ok">погоджено</Chip>
        ) : (
          <Chip>не погоджено</Chip>
        )}
      </div>
      <dl className={s.dl}>
        <dt>Шаблон</dt>
        <dd>
          {plan.timetable_id ? (
            <Link to={`/scheduler/timetables/${plan.timetable_id}`}>
              {plan.timetable_id.slice(0, 8)}
            </Link>
          ) : (
            'ще не побудовано'
          )}
        </dd>
        <dt>Модель</dt>
        <dd>1.2 · укриття як навчальний простір</dd>
        <dt>Наказ</dt>
        <dd>
          {plan.order
            ? `№ ${plan.order.order_no} від ${formatDate(plan.order.order_date)}, ${plan.order.approved_by}`
            : 'ще не погоджено'}
        </dd>
        <dt>Дзвінки тривог</dt>
        <dd>
          {plan.bells.length
            ? `${plan.bells[0]!.start}–${plan.bells.at(-1)!.end}, ${plan.bells.length} уроків`
            : 'не задано'}
        </dd>
      </dl>

      {plan.activations.length > 0 && (
        <>
          <h4>Активації</h4>
          <ul className={s.activations}>
            {plan.activations.map((a) => (
              <li key={a.activation_id}>
                з {formatDate(a.from)}
                {a.to ? ` по ${formatDate(a.to)}` : ' — діє далі'}
                {a.from > today && <Badge>запланована</Badge>}
              </li>
            ))}
          </ul>
        </>
      )}

      {locked ? (
        <p className="muted">
          Поки є чинна або майбутня активація, перебудувати план і змінити дзвінки тривог не можна.
        </p>
      ) : (
        <Stack>
          <BuildAlert />
          {plan.state === 'draft' && plan.timetable_id && <ApproveAlert />}
          {plan.state === 'approved' && <ActivateAlert />}
        </Stack>
      )}
    </Card>
  );
}

function useInvalidatePlan() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['alert-plan'] });
    void qc.invalidateQueries({ queryKey: ['timetables'] });
  }, [qc]);
}

function BuildAlert() {
  const invalidate = useInvalidatePlan();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const build = useMutation({
    mutationFn: timetableApi.alertBuild,
    onSuccess: (r) => setJobId(r.job_id),
  });
  const running = !!jobId && !isTerminal(job.data);
  const done = job.data?.state === 'done';
  useEffect(() => {
    if (done) invalidate(); // план став draft — оновлюємо картку
  }, [done, invalidate]);
  return (
    <div>
      <Button disabled={build.isPending || running} onClick={() => build.mutate()}>
        Побудувати план тривог (модель 1.2)
      </Button>{' '}
      {running && job.data && <Spinner label={JOB_STATE_LABEL[job.data.state]} />}
      {job.data && isTerminal(job.data) && job.data.state !== 'done' && (
        <Notice tone="bad">
          <p>{JOB_STATE_LABEL[job.data.state]}</p>
        </Notice>
      )}
      {build.error && <ProblemNotice error={build.error} />}
    </div>
  );
}

function ApproveAlert() {
  const invalidate = useInvalidatePlan();
  const [form, setForm] = useState({ order_no: '', order_date: todayKyiv(), approved_by: '' });
  const approve = useMutation({
    mutationFn: () => timetableApi.alertApprove(form),
    onSuccess: invalidate,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    approve.mutate();
  };
  return (
    <form onSubmit={submit} className={s.inline}>
      <h4>Погодити наказом</h4>
      <Field label="Наказ №">
        {(id) => (
          <input
            id={id}
            required
            value={form.order_no}
            onChange={(e) => setForm({ ...form, order_no: e.target.value })}
          />
        )}
      </Field>
      <Field label="Дата наказу">
        {(id) => (
          <input
            id={id}
            type="date"
            required
            value={form.order_date}
            onChange={(e) => setForm({ ...form, order_date: e.target.value })}
          />
        )}
      </Field>
      <Field label="Затвердив">
        {(id) => (
          <input
            id={id}
            required
            value={form.approved_by}
            onChange={(e) => setForm({ ...form, approved_by: e.target.value })}
          />
        )}
      </Field>
      {approve.error && <ProblemNotice error={approve.error} />}
      <div>
        <Button type="submit" variant="primary" disabled={approve.isPending}>
          Погодити
        </Button>
      </div>
    </form>
  );
}

function LostSubstitutions({ warnings }: { warnings: Warnings | undefined }) {
  const n = warnings?.lost_substitutions.length ?? 0;
  if (!n) return null;
  return (
    <Notice tone="warn">
      <p>Втратять силу погоджені заміни: {n}.</p>
    </Notice>
  );
}

/** Розклад тривог погоджено наперед — активується з будь-якої навчальної дати не раніше сьогодні. */
function ActivateAlert() {
  const invalidate = useInvalidatePlan();
  const [from, setFrom] = useState(todayKyiv());
  const activate = useMutation({
    mutationFn: () => timetableApi.alertActivate(from),
    onSuccess: invalidate,
  });
  return (
    <form
      className={s.inline}
      onSubmit={(e) => {
        e.preventDefault();
        activate.mutate();
      }}
    >
      <h4>Перейти на розклад тривог</h4>
      <Field label="З дати" hint="Не раніше сьогодні, без 7-денного очікування">
        {(id) => (
          <input
            id={id}
            type="date"
            min={todayKyiv()}
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        )}
      </Field>
      {isApiError(activate.error, 'stale') ? (
        <Notice tone="bad">
          <p>
            Дані закладу змінилися, і план тривог їм уже не відповідає (ліміт моделі 1.2).
            Перебудуйте план.
          </p>
        </Notice>
      ) : (
        activate.error && <ProblemNotice error={activate.error} />
      )}
      <LostSubstitutions warnings={activate.data?.warnings} />
      <div>
        <Button type="submit" variant="primary" disabled={activate.isPending}>
          Активувати
        </Button>
      </div>
    </form>
  );
}

function EndActivation({ activationId, from }: { activationId: string; from: string }) {
  const invalidate = useInvalidatePlan();
  const min = [todayKyiv(), addDaysIso(from, 1)].sort().at(-1)!;
  const [date, setDate] = useState(min);
  const end = useMutation({
    mutationFn: () => timetableApi.alertEnd(activationId, date),
    onSuccess: invalidate,
  });
  return (
    <form
      className={s.inline}
      onSubmit={(e) => {
        e.preventDefault();
        end.mutate();
      }}
    >
      <h4>Повернути звичайний</h4>
      <Field label="З дати">
        {(id) => (
          <input
            id={id}
            type="date"
            min={min}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      {end.error && <ProblemNotice error={end.error} />}
      <LostSubstitutions warnings={end.data?.warnings} />
      <div>
        <Button type="submit" variant="primary" disabled={end.isPending}>
          Повернути звичайний розклад
        </Button>
      </div>
    </form>
  );
}

/** Облік тривог: тривалість за день і рекомендація за порогом (пороги віддає сервер). */
function AlertHoursCard() {
  const qc = useQueryClient();
  const to = todayKyiv();
  const from = addDaysIso(to, -13);
  const hours = useQuery({
    queryKey: ['alert-hours', from, to],
    queryFn: () => timetableApi.alertHours(from, to),
  });
  const [date, setDate] = useState(to);
  const [minutes, setMinutes] = useState('');
  const put = useMutation({
    mutationFn: () => timetableApi.putAlertHours(date, Number(minutes)),
    onSuccess: () => {
      setMinutes('');
      void qc.invalidateQueries({ queryKey: ['alert-hours'] });
    },
  });

  if (hours.isPending) return <Spinner />;
  if (hours.error) return <ProblemNotice error={hours.error} />;
  const h = hours.data;
  const max = Math.max(h.threshold_minutes * 1.5, ...h.days.map((d) => d.minutes));

  return (
    <Card>
      <div className={s.head}>
        <h3>Облік тривог · останні 14 днів</h3>
        <span className="muted">
          поріг: понад {h.threshold_minutes / 60} год за день, {h.threshold_days} дні поспіль
        </span>
      </div>
      {h.recommendation && (
        <Notice tone="warn">
          <p>
            Тривоги тривали понад {h.threshold_minutes / 60} год {h.current_streak_days} дні
            поспіль. Рекомендуємо перейти на розклад тривог — рішення ухвалює керівник закладу.
          </p>
        </Notice>
      )}
      <div className={s.bars} aria-label="Тривалість тривог по днях">
        {h.days.map((d) => (
          <div key={d.date} className={s.barCol} title={`${formatDate(d.date)}: ${d.minutes} хв`}>
            <div
              className={d.minutes > h.threshold_minutes ? s.barOver : s.bar}
              style={{ height: `${(d.minutes / max) * 100}%` }}
            />
            <span>{d.date.slice(8)}</span>
          </div>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          put.mutate();
        }}
      >
        <input
          type="date"
          aria-label="Дата"
          max={to}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          type="number"
          aria-label="Тривалість, хв"
          placeholder="хвилин"
          min={0}
          max={1440}
          required
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
        <Button type="submit" disabled={put.isPending}>
          Внести
        </Button>
        {put.error && <ProblemNotice error={put.error} />}
      </form>
    </Card>
  );
}
