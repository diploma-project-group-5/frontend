import { Card, PageHeader } from '@/ui';

/** Розділ кабінету, який ще не реалізовано. Для демо 13.11 дані йдуть із сід-файлу. */
export function PlaceholderPage({ title, endpoints }: { title: string; endpoints: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p>Розділ у роботі.</p>
        <p className="muted">
          API: <code>{endpoints}</code>
        </p>
      </Card>
    </>
  );
}
