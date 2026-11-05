/**
 * Токен QR живе у фрагменті URL (/c#<school_id>.<token_id>.<mac>), тож не потрапляє
 * в логи шлюзу, Referer і прев'ю месенджерів. На сервер іде лише в заголовку X-Access-Token.
 */
export function readTokenFromHash(hash: string): string | null {
  const t = hash.replace(/^#/, '').trim();
  return t.length > 0 ? t : null;
}
