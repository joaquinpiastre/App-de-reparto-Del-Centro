/**
 * URL de Realtime Database (misma que `databaseURL` en `services/firebase.ts`).
 *
 * En web podés sobreescribir con `.env`: `EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://tu-proyecto-default-rtdb.xxxxx.firebasedatabase.app`
 * (copiá la URL exacta desde Firebase Console → Realtime Database → pestaña de datos).
 */
export const DEFAULT_FIREBASE_PROJECT_ID = 'delcentro-reparto';

const trim = (u?: string) => u?.replace(/\/$/, '').trim() || '';

export function firebaseDatabaseUrlFromEnv(): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const u = trim(process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL);
  return u || undefined;
}

/** Bases REST a probar: env + formatos clásicos (firebaseio.com y firebasedatabase.app). */
export function primaryFirebaseDatabaseUrl(projectId = DEFAULT_FIREBASE_PROJECT_ID): string {
  return firebaseDatabaseUrlFromEnv() ?? `https://${projectId}-default-rtdb.firebaseio.com`;
}

export function rtdbRestCandidateBases(projectId = DEFAULT_FIREBASE_PROJECT_ID): string[] {
  const env = firebaseDatabaseUrlFromEnv();
  const out = new Set<string>();
  if (env) out.add(env);
  out.add(`https://${projectId}-default-rtdb.firebaseio.com`);
  out.add(`https://${projectId}-default-rtdb.firebasedatabase.app`);
  out.add(`https://${projectId}-default-rtdb-us-central1.firebasedatabase.app`);
  return [...out];
}
