import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import { MapaRealtime } from '@/components/mapa/MapaRealtime';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { suscribirTelefonosGps } from '@/services/gpsFeed';
import { useAppStore } from '@/store/useAppStore';
import type { TelefonoUbicacion } from '@/types';

export default function MapaVivo() {
  const setUltima = useAppStore((s) => s.setUltimaPosicion);
  const ultima = useAppStore((s) => s.ultimaPosicion);
  const [telefonos, setTelefonos] = useState<TelefonoUbicacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [avisoApi, setAvisoApi] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return suscribirTelefonosGps(
        (lista, meta) => {
          setTelefonos(lista);
          setError(null);
          setAvisoApi(meta?.advertencia ?? null);
        },
        (msg) => setError(msg)
      );
    }

    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Sin permiso de ubicación.');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 25 },
        (loc) => {
          const p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setUltima(p);
        }
      );
    })();
    return () => {
      sub?.remove();
    };
  }, [setUltima]);

  return (
    <Screen
      title="Mapa en tiempo real"
      subtitle={
        Platform.OS === 'web'
          ? `Teléfonos en reparto detectados: ${telefonos.length}`
          : 'Posición aproximada del dispositivo'
      }
    >
      {avisoApi ? <Text style={styles.aviso}>{avisoApi}</Text> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <MapaRealtime posicion={ultima} tituloMarcador="Este dispositivo" telefonos={telefonos} />
      {Platform.OS === 'web' && telefonos.length > 0 ? (
        <View style={styles.list}>
          {telefonos.map((t) => (
            <Text key={t.id} style={styles.item}>
              {t.nombre}: {t.posicion.lat.toFixed(5)}, {t.posicion.lng.toFixed(5)} ·{' '}
              {new Date(t.actualizadoEn).toLocaleTimeString('es-AR')}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.legend}>
        La web lee ubicaciones desde la API (`/gps/live`) y actualiza cada 10s.
      </Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  aviso: {
    fontFamily: 'Poppins_400Regular',
    color: '#b45309',
    marginBottom: 8,
    lineHeight: 20,
    fontSize: 13,
  },
  err: { fontFamily: 'Poppins_600SemiBold', color: COLORS.error, marginBottom: 8 },
  list: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    padding: 12,
    marginTop: 10,
  },
  item: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginBottom: 4 },
  legend: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginTop: 8 },
});
