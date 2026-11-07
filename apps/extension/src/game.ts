/** "/game/AbC123xyz" or "/game/AbC123xyz/" -> "AbC123xyz"; null if not a game path or token looks odd. */
export function gameTokenFromPath(pathname: string): string | null {
  const m = /^\/game\/([A-Za-z0-9_-]{4,40})\/?$/.exec(pathname);
  return m?.[1] ?? null;
}

export function isGamePath(pathname: string): boolean {
  return pathname.startsWith('/game/');
}
