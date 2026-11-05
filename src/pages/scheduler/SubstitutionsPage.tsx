import { Badge, Card, PageHeader } from '@/ui';

/** «Заміни» — етап 2 (після демо 13.11). */
export function SubstitutionsPage() {
  return (
    <>
      <PageHeader title="Заміни" />
      <Card>
        <p>
          <Badge>етап 2</Badge> Відсутність вчителя → пропозиції замін від солвера → погодження
          укладачем.
        </p>
        <ul className="muted">
          <li>
            <code>POST /absences</code> — вчитель, дати, увесь день або номери уроків (причину не
            вказуємо); по задачі на кожну дату
          </li>
          <li>
            <code>GET /substitutions?date=</code> — пропозиції: новий вчитель («не за фахом»),
            перенесений урок, самостійна робота
          </li>
          <li>
            <code>POST /substitutions/{'{job_id}'}:approve</code> / <code>:reject</code> — погоджені
            заміни видно на сторінках за QR як «Заміна»
          </li>
        </ul>
      </Card>
    </>
  );
}
