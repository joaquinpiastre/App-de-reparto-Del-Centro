export function abrirNavegacion(direccion: string) {
  const encoded = encodeURIComponent(direccion);
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}
