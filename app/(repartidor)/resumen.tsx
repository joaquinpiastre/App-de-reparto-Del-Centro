import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { setAuthToken } from '@/services/apiClient';
import { useHistorialStore } from '@/store/useHistorialStore';
import { useAppStore } from '@/store/useAppStore';

export default function Resumen() {
  const {
    cerrarJornada,
    resetSesion,
    usuario,
    clientesDelDia,
    jornadaActiva,
    jornadaInicioEpoch,
  } = useAppStore();
  const cierres = useHistorialStore((s) => s.cierres);

  const stats = useMemo(() => {
    if (jornadaActiva && clientesDelDia.length > 0) {
      const entregados = clientesDelDia.filter((c) => c.estado === 'entregado').length;
      const problemas = clientesDelDia.filter((c) => c.estado === 'problema').length;
      const minRuta =
        jornadaInicioEpoch != null
          ? Math.max(0, Math.round((Date.now() - jornadaInicioEpoch) / 60000))
          : 0;
      const tiempos = clientesDelDia
        .map((c) => c.tiempoParadaSegundos)
        .filter((t): t is number => typeof t === 'number' && t > 0);
      const promStop =
        tiempos.length > 0
          ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 60)
          : 0;
      return {
        titulo: `Turno en curso · ${usuario?.nombre ?? 'Repartidor'}`,
        lineas: [
          `${entregados}/${clientesDelDia.length} entregas`,
          `${minRuta} min en ruta`,
          promStop > 0 ? `${promStop} min promedio por parada` : 'Promedio por parada: —',
          `${problemas} incidencias`,
        ],
      };
    }
    const ultimo = cierres[0];
    if (ultimo) {
      return {
        titulo: `Último cierre · ${ultimo.repartidorNombre}`,
        lineas: [
          `${ultimo.completados}/${ultimo.total} entregas`,
          `${ultimo.minutosEnRuta} min en ruta`,
          'Resumen guardado en historial (admin)',
        ],
      };
    }
    return {
      titulo: 'Sin datos aún',
      lineas: ['Iniciá un turno para ver métricas del día.'],
    };
  }, [jornadaActiva, clientesDelDia, jornadaInicioEpoch, usuario?.nombre, cierres]);

  const cerrarSesion = async () => {
    await AsyncStorage.multiRemove(['jornada_id', 'repartidor_id']);
    await setAuthToken(null);
    resetSesion();
    router.replace('/(auth)/login');
  };

  return (
    <Screen title="Tu progreso" subtitle="Resumen del día" showBack>
      <View style={styles.card}>
        <Text style={styles.titulo}>{stats.titulo}</Text>
        {stats.lineas.map((m) => (
          <Text key={m} style={styles.metricText}>
            · {m}
          </Text>
        ))}
      </View>
      <Button
        label="GUARDAR Y CERRAR TURNO"
        variant="secondary"
        onPress={() => {
          Alert.alert('Guardar turno', '¿Guardar y finalizar la jornada?', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Guardar',
              onPress: () => void cerrarJornada(),
            },
          ]);
        }}
      />
      <Button label="CERRAR SESIÓN" variant="danger" onPress={cerrarSesion} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  titulo: { fontFamily: 'Poppins_700Bold', fontSize: 16, marginBottom: 8 },
  metricText: { fontFamily: 'Poppins_600SemiBold', marginTop: 4 },
});
