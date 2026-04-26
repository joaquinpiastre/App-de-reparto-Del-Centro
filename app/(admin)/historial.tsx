import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { useHistorialStore } from '@/store/useHistorialStore';

export default function Historial() {
  const cierres = useHistorialStore((s) => s.cierres);

  return (
    <Screen title="Historial de rutas" subtitle="Cierres guardados en el dispositivo">
      {cierres.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.title}>Sin cierres aún</Text>
          <Text style={styles.row}>Los repartidores generan entradas al «Cerrar turno».</Text>
        </View>
      ) : (
        cierres.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.title}>
              {new Date(c.fechaIso).toLocaleString('es-AR')} · {c.repartidorNombre}
            </Text>
            <Text style={styles.row}>
              {c.completados}/{c.total} entregas · {c.minutosEnRuta} min en ruta
            </Text>
          </View>
        ))
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10 },
  title: { fontFamily: 'Poppins_700Bold' },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4 },
});
