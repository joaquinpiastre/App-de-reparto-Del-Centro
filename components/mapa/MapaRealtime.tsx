import { StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { REGION_SAN_RAFAEL } from '@/constants/mapRegion';
import { COLORS } from '@/constants/colors';
import { formatHora } from '@/lib/fechaHora';
import type { Coordenadas, TelefonoUbicacion } from '@/types';

interface Props {
  /** Posición del repartidor (última GPS o null). */
  posicion?: Coordenadas | null;
  tituloMarcador?: string;
  telefonos?: TelefonoUbicacion[];
}

export function MapaRealtime({ posicion, tituloMarcador = 'Repartidor', telefonos = [] }: Props) {
  return (
    <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={REGION_SAN_RAFAEL}>
      {telefonos.map((t) => (
        <Marker
          key={t.id}
          coordinate={{ latitude: t.posicion.lat, longitude: t.posicion.lng }}
          title={t.nombre}
          description={`Actualizado ${formatHora(t.actualizadoEn)}`}
          pinColor={COLORS.verdePrincipal}
        />
      ))}
      {posicion ? (
        <Marker
          coordinate={{ latitude: posicion.lat, longitude: posicion.lng }}
          title={tituloMarcador}
          pinColor={COLORS.acentoAzul}
        />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { minHeight: 260, borderRadius: 16, overflow: 'hidden' },
});
