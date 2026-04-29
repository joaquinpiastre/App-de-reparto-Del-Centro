import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { REGION_SAN_RAFAEL } from '@/constants/demoData';
import type { RecorridoPoint, RecorridoStop } from '@/services/adminReportes';

interface Props {
  points: RecorridoPoint[];
  stops: RecorridoStop[];
}

export function MapaRecorridoHistorial({ points, stops }: Props) {
  const srcDoc = useMemo(() => {
    const safePoints = JSON.stringify(points).replace(/</g, '\\u003c');
    const safeStops = JSON.stringify(stops).replace(/</g, '\\u003c');
    const lat0 = REGION_SAN_RAFAEL.latitude;
    const lng0 = REGION_SAN_RAFAEL.longitude;
    return `<!doctype html><html><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>html,body,#map{height:100%;margin:0}.popup{font-family:Arial,sans-serif;font-size:12px}</style>
    </head><body><div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const points=${safePoints};const stops=${safeStops};
      const map=L.map('map');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
      if(!points.length){ map.setView([${lat0},${lng0}],13); }
      else{
        const latlngs = points.map(p=>[p.lat,p.lng]);
        const line = L.polyline(latlngs,{color:'#2196F3',weight:4}).addTo(map);
        const inicio = points[0], fin = points[points.length-1];
        L.marker([inicio.lat,inicio.lng]).addTo(map).bindPopup('<div class="popup"><strong>Inicio</strong></div>');
        L.marker([fin.lat,fin.lng]).addTo(map).bindPopup('<div class="popup"><strong>Fin</strong></div>');
        stops.forEach((s,idx)=>{
          const mins=Math.round((s.duracionSegundos||0)/60);
          L.circleMarker([s.lat,s.lng],{radius:6,color:'#f59e0b',fillOpacity:0.9}).addTo(map)
           .bindPopup('<div class="popup"><strong>Parada '+(idx+1)+'</strong><br/>'+mins+' min detenido</div>');
        });
        map.fitBounds(line.getBounds(),{padding:[24,24]});
      }
    </script></body></html>`;
  }, [points, stops]);

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sin puntos GPS para esta jornada.</Text>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {React.createElement('iframe', {
        title: 'Mapa historial recorrido',
        srcDoc,
        style: styles.mapFrame as unknown as React.CSSProperties,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  mapFrame: { borderWidth: 0, borderRadius: 16, width: '100%', minHeight: 360, backgroundColor: '#e8eef0' },
  empty: {
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario },
});
