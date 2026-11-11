import conflictSchema from '@lad/contracts/schemas/events/conflict.v1.json';
import defsSchema from '@lad/contracts/schemas/events/defs.v1.json';
import Ajv2020 from 'ajv/dist/2020';

/**
 * Схеми з репозиторію contracts (той самий пакет @lad/contracts, що й у timetable-service
 * і validator-lib). Формати (uuid, date) не перевіряємо: важлива форма об'єкта.
 */
const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
ajv.addSchema(defsSchema);
const validateConflict = ajv.compile(conflictSchema);

/** Помилки ajv у читабельному вигляді; порожній масив — об'єкт відповідає conflict.v1.json. */
export function conflictErrors(value: unknown): string[] {
  if (validateConflict(value)) return [];
  return (validateConflict.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
}

/** Усі коди rule з контракту. */
export const CONFLICT_RULES: readonly string[] = conflictSchema.properties.rule.enum;
export { conflictSchema };
