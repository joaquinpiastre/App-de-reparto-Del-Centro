import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { COLORS } from '@/constants/colors';
import { separarPuntosSuperpuestos } from '@/lib/mapaUtil';
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
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
  };
}

function calcularRegionDesdeVisitas(visitStops: VisitStop[]) {
  const lats = visitStops.map((v) => v.lat);
  const lngs = visitStops.map((v) => v.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.015),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.015),
  };
}

export function MapaRecorridoHistorial({ points, stops, visitStops = [] }: Props) {
  const tieneTrack   = points.length > 0;
  const tieneVisitas = visitStops.length > 0;

  if (!tieneTrack && !tieneVisitas) {
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
  const region = tieneTrack
    ? calcularRegion(points)
    : calcularRegionDesdeVisitas(visitStops);
  const stopsSeparados = separarPuntosSuperpuestos(stops);
  const visitStopsSeparados = separarPuntosSuperpuestos(visitStops);

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={region}
      scrollEnabled={false}
      zoomEnabled={true}
    >
      {/* Traza GPS */}
      {tieneTrack && (
        <>
          <Polyline coordinates={coords} strokeColor={COLORS.acentoAzul} strokeWidth={4} />
          <Marker
            coordinate={{ latitude: points[0].lat, longitude: points[0].lng }}
            title="Inicio del turno"
            pinColor="#22c55e"
          />
          <Marker
            coordinate={{ latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lng }}
            title="Fin del turno"
            pinColor="#ef4444"
          />
          {stopsSeparados.map((s, i) => (
            <Marker
              key={`stop-${i}-${s.inicio}`}
              coordinate={{ latitude: s.lat, longitude: s.lng }}
              title={`Parada GPS ${i + 1}`}
              description={`${Math.round(s.duracionSegundos / 60)} min detenido`}
              pinColor="#f59e0b"
            />
          ))}
        </>
      )}

      {/* Visitas marcadas por el repartidor */}
      {visitStopsSeparados.map((v, i) => (
        <Marker
          key={`visit-${i}-${v.inicio}`}
          coordinate={{ latitude: v.lat, longitude: v.lng }}
          title={`${i + 1}. ${v.nombre}`}
          description={[
            v.estado === 'entregado' ? '✓ Entregado' : '⚠ Problema',
            v.duracionSegundos > 0 ? `${Math.round(v.duracionSegundos / 60)} min en el lugar` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          pinColor={v.estado === 'entregado' ? '#22c55e' : '#f97316'}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { minHeight: 340, borderRadius: 16, overflow: 'hidden' },
  empty: {
    minHeight: 180,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 6,
  },
  emptyText: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisSecundario,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: COLORS.grisSecundario,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
});
