import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { obtenerHistorialAdmin } from '@/services/adminReportes';
import type { CierreJornadaResumen } from '@/store/useHistorialStore';

export default function Historial() {
  const [cierres, setCierres] = useState<CierreJornadaResumen[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await obtenerHistorialAdmin();
      setCierres(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  return (
    <Screen title="Historial de rutas" subtitle="Cierres de jornada registrados en backend">
      <View style={styles.topRow}>
        <Button
          label={loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}
          variant="secondary"
          loading={loading}
          onPress={() => void cargar()}
        />
      </View>
      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.row}>{error}</Text>
        </View>
      ) : null}
      {cierres.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.title}>Sin cierres aún</Text>
          <Text style={styles.row}>Los cierres aparecen cuando hay entregas registradas.</Text>
        </View>
      ) : (
        <FlatList
          data={cierres}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item: c }) => (
            <View style={styles.card}>
              <Text style={styles.title}>
                {new Date(c.fechaIso).toLocaleString('es-AR')} · {c.repartidorNombre}
              </Text>
              <Text style={styles.row}>
                {c.completados}/{c.total} entregas · {c.minutosEnRuta} min en ruta
              </Text>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  topRow: { alignItems: 'flex-start' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10 },
  errorCard: { borderWidth: 1, borderColor: '#e06a6a', backgroundColor: '#fff3f3' },
  title: { fontFamily: 'Poppins_700Bold' },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4 },
});
