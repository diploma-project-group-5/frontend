import { createContext, useContext } from 'react';
import type { Identity } from './keycloak';

export interface AuthValue extends Identity {
  logout: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth поза AuthGate');
  return v;
}
