interface ConCoordenadas {
  lat: number;
  lng: number;
}

/**
 * Cuando el GPS del repartidor reporta pocos puntos por jornada (típico de un
 * tracker hardware con intervalo largo), varias paradas/visitas terminan
 * mapeadas al mismo punto GPS más cercano y quedan superpuestas en el mapa
 * (solo se ve la última, tapando al resto). Esta función separa en un
 * pequeño círculo los puntos que caen en la misma posición (o muy cerca)
 * para que todos queden visibles y clickeables, sin alterar los que ya
 * tienen posición propia.
 */
export function separarPuntosSuperpuestos<T extends ConCoordenadas>(
  items: T[],
  radioGrados = 0.00015
): T[] {
  const PRECISION = 4; // ~11m de tolerancia para considerar "mismo punto"
  const grupos = new Map<string, number[]>();

  items.forEach((item, i) => {
    const clave = `${item.lat.toFixed(PRECISION)},${item.lng.toFixed(PRECISION)}`;
    const indices = grupos.get(clave) ?? [];
    indices.push(i);
    grupos.set(clave, indices);
  });

  const resultado = items.map((item) => ({ ...item }));

  for (const indices of grupos.values()) {
    if (indices.length <= 1) continue;
    indices.forEach((idx, posicion) => {
      const angulo = (2 * Math.PI * posicion) / indices.length;
      resultado[idx].lat = items[idx].lat + radioGrados * Math.cos(angulo);
      resultado[idx].lng = items[idx].lng + radioGrados * Math.sin(angulo);
    });
  }

  return resultado;
}
