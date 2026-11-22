import { auditActionLabel, formatAuditDetails } from './audit';

describe('журнал: переклад кодів', () => {
  it('відомі дії — українською, невідомі — як є', () => {
    expect(auditActionLabel('class_created')).toBe('Додано клас');
    expect(auditActionLabel('alert_plan_ended')).toBe('Повернено звичайний розклад');
    expect(auditActionLabel('something_new')).toBe('something_new');
  });

  it('details: підписи ключів, поля профілю, дати й вкладені об’єкти', () => {
    expect(formatAuditDetails({ fields: ['shelter_capacity', 'saturday'] })).toBe(
      'поля: паспортна місткість укриття, субота',
    );
    expect(formatAuditDetails({ order_no: '', order_date: '2026-11-19' })).toBe(
      'наказ №: —; дата наказу: 19.11.2026',
    );
    expect(formatAuditDetails({ replaced_scheduled: false })).toBe('замінено заплановану: ні');
    expect(formatAuditDetails({ extra: { a: 1 } })).toBe('extra: (a: 1)');
    expect(formatAuditDetails({ extra: { a: 1 } })).not.toContain('[object Object]');
  });
});
