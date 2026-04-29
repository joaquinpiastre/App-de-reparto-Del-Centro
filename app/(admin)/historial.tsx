import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { MapaRecorridoHistorial } from '@/components/mapa/MapaRecorridoHistorial';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { obtenerHistorialAdmin, obtenerRecorridoJornadaAdmin, type RecorridoJornadaResponse } from '@/services/adminReportes';
import type { CierreJornadaResumen } from '@/store/useHistorialStore';

export default function Historial() {
  const [cierres, setCierres] = useState<CierreJornadaResumen[]>([]);
  const [seleccionado, setSeleccionado] = useState<CierreJornadaResumen | null>(null);
  const [recorrido, setRecorrido] = useState<RecorridoJornadaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRecorrido, setLoadingRecorrido] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await obtenerHistorialAdmin();
      setCierres(data);
      if (data.length > 0 && !seleccionado) {
        setSeleccionado(data[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  useEffect(() => {
    if (!seleccionado) return;
    void (async () => {
      try {
        setLoadingRecorrido(true);
        const data = await obtenerRecorridoJornadaAdmin(seleccionado.id);
        setRecorrido(data);
      } catch {
        setRecorrido(null);
      } finally {
        setLoadingRecorrido(false);
      }
    })();
  }, [seleccionado?.id]);

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
      {seleccionado ? (
        <View style={styles.card}>
          <Text style={styles.title}>Recorrido de jornada</Text>
          <Text style={styles.row}>
            {seleccionado.repartidorNombre} · {new Date(seleccionado.fechaIso).toLocaleString('es-AR')}
          </Text>
          {loadingRecorrido ? (
            <Text style={styles.row}>Cargando trazado GPS…</Text>
          ) : (
            <>
              <MapaRecorridoHistorial points={recorrido?.points ?? []} stops={recorrido?.stops ?? []} />
              <Text style={styles.row}>
                Puntos: {recorrido?.points.length ?? 0} · Paradas +2 min: {recorrido?.stops.length ?? 0}
              </Text>
              {(recorrido?.stops.length ?? 0) > 0
                ? (recorrido?.stops ?? []).map((s, i) => (
                    <Text key={`${s.inicio}-${i}`} style={styles.row}>
                      • Parada {i + 1}: {new Date(s.inicio).toLocaleTimeString('es-AR')} -{' '}
                      {new Date(s.fin).toLocaleTimeString('es-AR')} ({Math.round(s.duracionSegundos / 60)} min)
                    </Text>
                  ))
                : null}
            </>
          )}
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
              <View style={styles.topRow}>
                <Button label="Ver recorrido" variant="secondary" onPress={() => setSeleccionado(c)} />
              </View>
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
