import fc from 'fast-check';
import type { Conflict } from '@/api/types';
import { CONFLICT_RULES, conflictErrors } from '@/test/contracts';
import { conflictNames, describeConflict } from './conflicts';

const names = conflictNames({
  classes: [{ class_id: 'c1', name: '5-А' }],
  teachers: [{ teacher_id: 't1', label: 'Іваненко О. П.' }],
  subjects: [{ subject_id: 's1', name: 'Історія', short_name: 'Іст' }],
});

describe('describeConflict', () => {
  it('capacity_exceeded: умова в condition, value і limit — числа', () => {
    const c: Conflict = {
      rule: 'capacity_exceeded',
      day: 2,
      condition: 'seats',
      value: 160,
      limit: 150,
    };
    expect(describeConflict(c)).toBe(
      'Укриття переповнене (вівторок): 160 при ліміті 150 (навчальні місця).',
    );
  });

  it('підставляє назви з даних закладу за ідентифікаторами', () => {
    expect(
      describeConflict(
        { rule: 'teacher_double_booked', teacher_id: 't1', day: 3, lesson_no: 2 },
        names,
      ),
    ).toBe('Іваненко О. П.: накладка уроків (середа, 2 урок).');
    expect(
      describeConflict(
        { rule: 'plan_hours_mismatch', class_id: 'c1', subject_id: 's1', value: 1, limit: 2 },
        names,
      ),
    ).toBe('5-А · Історія: кількість уроків не збігається з планом (1 замість 2).');
  });

  it('без назви не показує ідентифікатор, невідоме правило — кодом', () => {
    expect(describeConflict({ rule: 'teacher_unavailable_day', teacher_id: 'x', day: 1 })).toBe(
      'Вчитель: урок у недоступний день (понеділок).',
    );
    expect(describeConflict({ rule: 'something_new' })).toBe('Порушено правило something_new.');
  });
});

describe('describeConflict проти contracts/conflict.v1.json', () => {
  it('для кожного коду rule з контракту є власний текст', () => {
    const generic = CONFLICT_RULES.filter((rule) =>
      describeConflict({ rule }).startsWith('Порушено правило'),
    );
    expect(generic).toEqual([]);
  });

  it('будь-який конфлікт за схемою: непорожній текст без ідентифікаторів і «undefined»', () => {
    const id = fc.constantFrom('c1', 't1', 's1', 'unknown-id-42');
    const conflict = fc.record(
      {
        rule: fc.constantFrom(...CONFLICT_RULES),
        class_id: id,
        teacher_id: id,
        subject_id: id,
        day: fc.integer({ min: 1, max: 6 }),
        lesson_no: fc.integer({ min: 1, max: 10 }),
        condition: fc.constantFrom('seats' as const, 'passport' as const),
        value: fc.nat(500),
        limit: fc.nat(500),
        hint: fc.boolean(),
      },
      { requiredKeys: ['rule'] },
    );
    fc.assert(
      fc.property(conflict, (c) => {
        expect(conflictErrors(c)).toEqual([]);
        const text = describeConflict(c as Conflict, names);
        expect(text.length).toBeGreaterThan(5);
        expect(text).not.toMatch(/undefined|null|NaN|unknown-id-42/);
      }),
    );
  });
});
