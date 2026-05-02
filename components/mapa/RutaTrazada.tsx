import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { REGION_SAN_RAFAEL } from '@/constants/mapRegion';
import { COLORS } from '@/constants/colors';
import type { Cliente } from '@/types';

interface Props {
  clientes: Cliente[];
  destacarClienteId?: string | null;
}

export function RutaTrazada({ clientes, destacarClienteId }: Props) {
  const coords = clientes
    .filter((c) => c.coordenadas)
    .map((c) => ({
      latitude: c.coordenadas.lat,
      longitude: c.coordenadas.lng,
    }));

  if (coords.length === 0) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Sin coordenadas para mostrar el mapa</Text>
      </View>
    );
  }

  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={REGION_SAN_RAFAEL}
      showsUserLocation
    >
      {clientes.map((c) => (
        <Marker
          key={c.id}
          coordinate={{ latitude: c.coordenadas.lat, longitude: c.coordenadas.lng }}
          title={c.nombre}
          description={c.direccion}
          pinColor={destacarClienteId === c.id ? COLORS.verdeOscuro : undefined}
        />
      ))}
      {coords.length > 1 ? (
        <Polyline coordinates={coords} strokeColor={COLORS.verdePrincipal} strokeWidth={3} />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { minHeight: 220, borderRadius: 16, overflow: 'hidden' },
  fallback: {
    minHeight: 220,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fallbackText: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto },
});
