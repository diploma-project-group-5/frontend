import { activeBuildJobKey, clearSessionState } from './session';

it('вихід прибирає стан кабінету (задачу побудови), але не чужі ключі', () => {
  sessionStorage.setItem(activeBuildJobKey('sch1'), 'job-1');
  sessionStorage.setItem('other.app', 'keep');
  clearSessionState();
  expect(sessionStorage.getItem(activeBuildJobKey('sch1'))).toBeNull();
  expect(sessionStorage.getItem('other.app')).toBe('keep');
  sessionStorage.clear();
});

it('ключ задачі — свій для кожного закладу', () => {
  expect(activeBuildJobKey('a')).not.toBe(activeBuildJobKey('b'));
});
