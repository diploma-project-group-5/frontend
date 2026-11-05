import { api, request } from './http';
import type {
  AccessToken,
  AlertHours,
  AlertPlan,
  AuditEntry,
  Bell,
  ClassInput,
  CurriculumRow,
  Holidays,
  Job,
  JobAccepted,
  PublicTimetable,
  PublishRequest,
  PublishResponse,
  SchoolClass,
  SchoolListItem,
  SchoolProfile,
  SchoolRegistered,
  SchoolRegistration,
  Subject,
  SubjectInput,
  Teacher,
  TeacherInput,
  TimetableDetail,
  TimetableLoad,
  TimetableSummary,
  TokenScope,
  Warnings,
} from './types';

/** Заклад береться з JWT — у шляхах його немає (розділ 07). */

export const tenantApi = {
  listSchools: () => api.get<SchoolListItem[]>('/tenant/schools'),
  registerSchool: (body: SchoolRegistration) => api.post<SchoolRegistered>('/tenant/schools', body),
};

export const schoolApi = {
  getProfile: () => api.get<SchoolProfile>('/school/school'),
  putProfile: (body: Partial<SchoolProfile>) => api.put<SchoolProfile>('/school/school', body),
  getBells: () => api.get<Bell[]>('/school/bells'),
  putBells: (bells: Bell[]) => api.put<Bell[]>('/school/bells', bells),
  listClasses: () => api.get<SchoolClass[]>('/school/classes'),
  createClass: (body: ClassInput) => api.post<SchoolClass>('/school/classes', body),
  updateClass: (id: string, body: ClassInput) =>
    api.put<SchoolClass>(`/school/classes/${encodeURIComponent(id)}`, body),
  /** «Видалення» класу = архівування (archived_at); його QR стає недійсним. */
  archiveClass: (id: string) => api.delete<void>(`/school/classes/${encodeURIComponent(id)}`),
  listSubjects: () => api.get<Subject[]>('/school/subjects'),
  createSubject: (body: SubjectInput) => api.post<Subject>('/school/subjects', body),
  updateSubject: (id: string, body: SubjectInput) =>
    api.put<Subject>(`/school/subjects/${encodeURIComponent(id)}`, body),
  /** 409, якщо предмет є в навчальному плані. */
  archiveSubject: (id: string) => api.delete<void>(`/school/subjects/${encodeURIComponent(id)}`),
  listTeachers: () => api.get<Teacher[]>('/school/teachers'),
  createTeacher: (body: TeacherInput) => api.post<Teacher>('/school/teachers', body),
  updateTeacher: (id: string, body: TeacherInput) =>
    api.put<Teacher>(`/school/teachers/${encodeURIComponent(id)}`, body),
  /** Етап 2 · видалення даних вчителя (ст. 15): лишається «Вчитель #N»; 409, якщо він у плані. */
  deleteTeacher: (id: string) => api.delete<void>(`/school/teachers/${encodeURIComponent(id)}`),
  /** Етап 2 · експорт даних вчителя (ст. 8), частина school-service. */
  exportTeacher: (id: string) =>
    api.get<Record<string, unknown>>(`/school/teachers/${encodeURIComponent(id)}/export`),
  getCurriculum: () => api.get<CurriculumRow[]>('/school/curriculum'),
  /** Увесь план одним запитом: клас × предмет → вчитель, годин на тиждень. */
  putCurriculum: (rows: CurriculumRow[]) => api.put<CurriculumRow[]>('/school/curriculum', rows),
  audit: (q: { from: string; to: string; target?: string }) =>
    api.get<AuditEntry[]>('/school/audit', { query: q }),
};

export const timetableApi = {
  build: () => api.post<JobAccepted>('/timetable/timetables:build'),
  getJob: (jobId: string) => api.get<Job>(`/timetable/jobs/${encodeURIComponent(jobId)}`),
  list: () => api.get<TimetableSummary[]>('/timetable/timetables'),
  get: (id: string) => api.get<TimetableDetail>(`/timetable/timetables/${encodeURIComponent(id)}`),
  load: (id: string) =>
    api.get<TimetableLoad>(`/timetable/timetables/${encodeURIComponent(id)}/load`),
  publish: (id: string, body: PublishRequest) =>
    api.post<PublishResponse>(`/timetable/timetables/${encodeURIComponent(id)}:publish`, body),

  alertPlan: () => api.get<AlertPlan>('/timetable/alert-plan'),
  alertBuild: () => api.post<JobAccepted>('/timetable/alert-plan:build'),
  alertApprove: (body: { order_no: string; order_date: string; approved_by: string }) =>
    api.post<AlertPlan>('/timetable/alert-plan:approve', body),
  alertActivate: (from: string) =>
    api.post<{ warnings: Warnings }>('/timetable/alert-plan:activate', { from }),
  alertEnd: (activationId: string, from: string) =>
    api.post<{ warnings: Warnings }>(
      `/timetable/alert-plan/activations/${encodeURIComponent(activationId)}:end`,
      { from },
    ),
  alertHours: (from: string, to: string) =>
    api.get<AlertHours>('/timetable/alert-hours', { query: { from, to } }),
  putAlertHours: (date: string, minutes: number) =>
    api.put<unknown>(`/timetable/alert-hours/${date}`, { minutes }),

  /** Етап 2 · частина експорту вчителя з timetable: уроки у версіях, відсутності, заміни. */
  exportTeacher: (id: string) =>
    api.get<Record<string, unknown>>(`/timetable/teachers/${encodeURIComponent(id)}/export`),
  getHolidays: () => api.get<Holidays>('/timetable/holidays'),
  putHolidays: (body: Holidays) => api.put<Holidays>('/timetable/holidays', body),

  accessTokens: (type: TokenScope) =>
    api.get<AccessToken[]>('/timetable/access-tokens', { query: { type } }),
  rotateToken: (id: string) =>
    api.post<AccessToken>(`/timetable/access-tokens/${encodeURIComponent(id)}:rotate`),
};

export const publicApi = {
  /** Без JWT; токен — лише в заголовку, ніколи в URL запиту. */
  timetable: (accessToken: string, signal?: AbortSignal) =>
    request<PublicTimetable>('/public/timetable', {
      anonymous: true,
      headers: { 'X-Access-Token': accessToken },
      signal,
    }).then((r) => r.data),
};
