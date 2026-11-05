import Keycloak from 'keycloak-js';
import { config } from '@/config';
import { setTokenProvider } from '@/api/http';

/**
 * Вхід — Keycloak за маршрутом /idp, Authorization Code + PKCE (розділ 08).
 * Окремих /login, /refresh, /me немає: усе робить keycloak-js.
 * Access живе 15 хв, refresh ротується, сесія до 8 год — налаштування realm.
 *
 * Модуль імпортують лише маршрути кабінету, тож сторінки за QR його не завантажують.
 */
export const keycloak = new Keycloak({
  url: config.keycloak.url,
  realm: config.keycloak.realm,
  clientId: config.keycloak.clientId,
});

export type Role = 'sysadmin' | 'scheduler';

let initPromise: Promise<boolean> | null = null;

export function initKeycloak(): Promise<boolean> {
  initPromise ??= keycloak
    .init({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
      // Перший вхід укладача: Keycloak сам вимагає замінити тимчасовий пароль (UPDATE_PASSWORD).
    })
    .then((authenticated) => {
      setTokenProvider(async () => {
        try {
          await keycloak.updateToken(30);
        } catch {
          await keycloak.login();
        }
        return keycloak.token;
      });
      return authenticated;
    });
  return initPromise;
}

export interface Identity {
  username: string;
  roles: Role[];
  schoolId: string | null;
}

export function currentIdentity(): Identity {
  const t = keycloak.tokenParsed as
    | (Keycloak.KeycloakTokenParsed & { preferred_username?: string; school_id?: string })
    | undefined;
  const roles = (['sysadmin', 'scheduler'] as const).filter((r) => keycloak.hasRealmRole(r));
  return {
    username: t?.preferred_username ?? '',
    roles,
    schoolId: t?.school_id ?? null,
  };
}

export function logout() {
  return keycloak.logout({ redirectUri: window.location.origin + '/' });
}
