import { useEffect, useState } from 'react';

export function useTimer(activo: boolean) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [activo]);
  return segundos;
}
