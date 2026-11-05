import type { AuthValue } from '@/auth/AuthContext';
import type { Role } from '@/auth/keycloak';

/**
 * Мок-вхід без Keycloak. Роль зберігається в sessionStorage;
 * «Вийти» в мок-режимі перемикає роль (укладач ↔ адмін).
 */
const KEY = 'lad.mockRole';

function readRole(): Role {
  try {
    return sessionStorage.getItem(KEY) === 'sysadmin' ? 'sysadmin' : 'scheduler';
  } catch {
    return 'scheduler';
  }
}

export function mockAuth(): AuthValue {
  const role = readRole();
  return {
    username: role === 'sysadmin' ? 'admin (мок)' : 'lyceum17 (мок)',
    roles: [role],
    schoolId: role === 'scheduler' ? 'sch1' : null,
    logout: () => {
      try {
        sessionStorage.setItem(KEY, role === 'sysadmin' ? 'scheduler' : 'sysadmin');
      } catch {
        /* без збереження */
      }
      window.location.assign('/');
    },
  };
}
