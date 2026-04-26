/**
 * En navegador no inicializamos el SDK modular de Firebase: Metro incluye código con
 * `import.meta` y el bundle se sirve como script clásico → SyntaxError y pantalla en blanco.
 *
 * El panel web usa pedidos en modo local (AsyncStorage) o, en el futuro, podés exponer una API
 * propia / usar Firebase solo vía fetch sin este SDK en el cliente.
 */
export function isFirebaseConfigured(): boolean {
  return false;
}

export const auth = null;
export const db = null;
export const rtdb = null;
export const storage = null;
