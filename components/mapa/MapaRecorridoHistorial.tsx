import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { COLORS } from '@/constants/colors';
import type { RecorridoPoint, RecorridoStop, VisitStop } from '@/services/adminReportes';

interface Props {
  points: RecorridoPoint[];
  stops: RecorridoStop[];
  visitStops?: VisitStop[];
}

function calcularRegion(points: RecorridoPoint[]) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.01);
  const lngDelta = Math.max((maxLng - minLng) * 1.4, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export function MapaRecorridoHistorial({ points, stops, visitStops = [] }: Props) {
  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sin puntos GPS para esta jornada.</Text>
        <Text style={styles.emptyHint}>
          El recorrido se registra solo si el repartidor tiene permisos de ubicación en segundo plano activados en su teléfono.
        </Text>
      </View>
    );
  }
  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const start = points[0];
  const end = points[points.length - 1];
  const region = calcularRegion(points);
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={region}
      scrollEnabled={false}
      zoomEnabled={true}
    >
      <Polyline coordinates={coords} strokeColor={COLORS.acentoAzul} strokeWidth={4} />
      <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} title="Inicio" pinColor="#22c55e" />
      <Marker coordinate={{ latitude: end.lat, longitude: end.lng }} title="Fin" pinColor="#ef4444" />
      {stops.map((s, i) => (
        <Marker
          key={`stop-${i}-${s.inicio}`}
          coordinate={{ latitude: s.lat, longitude: s.lng }}
          title={`Parada GPS ${i + 1}`}
          description={`${Math.round(s.duracionSegundos / 60)} min detenido`}
          pinColor="#f59e0b"
        />
      ))}
      {visitStops.map((v, i) => (
        <Marker
          key={`visit-${i}-${v.inicio}`}
          coordinate={{ latitude: v.lat, longitude: v.lng }}
          title={v.nombre}
          description={`${v.estado === 'entregado' ? '✓ Entregado' : '⚠ Problema'} · ${Math.round(v.duracionSegundos / 60)} min`}
          pinColor={v.estado === 'entregado' ? '#22c55e' : '#f97316'}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { minHeight: 320, borderRadius: 16, overflow: 'hidden' },
  empty: {
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario, textAlign: 'center' },
  emptyHint: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, textAlign: 'center', marginTop: 6, lineHeight: 17 },
});
