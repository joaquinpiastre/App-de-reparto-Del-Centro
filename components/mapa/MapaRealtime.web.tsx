import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { REGION_SAN_RAFAEL } from '@/constants/mapRegion';
import { COLORS } from '@/constants/colors';
import type { Coordenadas, TelefonoUbicacion } from '@/types';

interface Props {
  posicion?: Coordenadas | null;
  tituloMarcador?: string;
  telefonos?: TelefonoUbicacion[];
}

/**
 * Mapa visual para web con Leaflet dentro de iframe (evita dependencias nativas).
 */
export function MapaRealtime({ posicion, tituloMarcador = 'Dispositivo', telefonos = [] }: Props) {
  const srcDoc = useMemo(() => {
    const puntos = telefonos.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      lat: t.posicion.lat,
      lng: t.posicion.lng,
      actualizadoEn: t.actualizadoEn,
    }));
    if (posicion) {
      puntos.push({
        id: 'dispositivo-local',
        nombre: tituloMarcador,
        lat: posicion.lat,
        lng: posicion.lng,
        actualizadoEn: Date.now(),
      });
    }

    const puntosJson = JSON.stringify(puntos).replace(/</g, '\\u003c');
    const lat0 = REGION_SAN_RAFAEL.latitude;
    const lng0 = REGION_SAN_RAFAEL.longitude;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; }
    .popup { font-family: Arial, sans-serif; font-size: 12px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const points = ${puntosJson};
    const map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    if (!points.length) {
      map.setView([${lat0}, ${lng0}], 13);
    } else {
      const bounds = [];
      points.forEach((p) => {
        const m = L.marker([p.lat, p.lng]).addTo(map);
        const hora = new Date(p.actualizadoEn).toLocaleTimeString('es-AR');
        m.bindPopup('<div class="popup"><strong>' + p.nombre + '</strong><br/>Actualizado: ' + hora + '</div>');
        bounds.push([p.lat, p.lng]);
      });
      if (bounds.length === 1) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [30, 30] });
    }
  </script>
</body>
</html>`;
  }, [posicion, telefonos, tituloMarcador]);

  return (
    <View style={styles.wrap}>
      {React.createElement('iframe', {
        title: 'Mapa telefonos en reparto',
        srcDoc,
        style: styles.mapFrame as unknown as React.CSSProperties,
      })}
      {!telefonos.length && !posicion ? (
        <Text style={styles.footerHint}>
          Todavía no hay teléfonos reportando GPS en tiempo real.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 900, alignSelf: 'center' },
  mapFrame: {
    borderWidth: 0,
    borderRadius: 16,
    width: '100%',
    minHeight: 380,
    backgroundColor: '#e8eef0',
  },
  footerHint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: COLORS.grisSecundario,
    marginTop: 8,
  },
});
