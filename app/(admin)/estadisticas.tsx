import { useEffect, useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { obtenerStatsAdmin, type AdminStatsResponse } from '@/services/adminReportes';

const chartW = Dimensions.get('window').width - 48;

export default function Estadisticas() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await obtenerStatsAdmin();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const { labels, entregas, minutos } = useMemo(() => {
    const series = stats?.series;
    return {
      labels: series?.labels ?? [],
      entregas: series?.entregas ?? [],
      minutos: series?.minutos ?? [],
    };
  }, [stats]);

  return (
    <Screen title="Estadísticas" subtitle="Métricas reales desde backend">
      <ScrollView>
        <View style={styles.topRow}>
          <Button
            label={loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}
            loading={loading}
            variant="secondary"
            onPress={() => void cargar()}
          />
        </View>
        {error ? (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.text}>{error}</Text>
          </View>
        ) : null}
        {!stats || stats.resumen.jornadas === 0 ? (
          <View style={styles.card}>
            <Text style={styles.text}>Todavía no hay datos para mostrar.</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.h}>Resumen general</Text>
              <Text style={styles.text}>Jornadas: {stats.resumen.jornadas}</Text>
              <Text style={styles.text}>Entregas: {stats.resumen.entregas}</Text>
              <Text style={styles.text}>Incidencias: {stats.resumen.incidencias}</Text>
              <Text style={styles.text}>
                Promedio minutos en ruta: {stats.resumen.promedioMinutosRuta}
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.h}>Entregas por cierre reciente</Text>
              <BarChart
                data={{
                  labels: labels.length ? labels : ['—'],
                  datasets: [{ data: entregas.length ? entregas : [0] }],
                }}
                width={chartW}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                fromZero
                chartConfig={{
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  decimalPlaces: 0,
                  color: () => COLORS.verdeOscuro,
                  labelColor: () => COLORS.grisTexto,
                }}
                style={styles.chart}
              />
            </View>
            <View style={styles.card}>
              <Text style={styles.h}>Minutos en ruta por cierre</Text>
              <BarChart
                data={{
                  labels: labels.length ? labels : ['—'],
                  datasets: [{ data: minutos.length ? minutos : [0] }],
                }}
                width={chartW}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                fromZero
                chartConfig={{
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  decimalPlaces: 0,
                  color: () => COLORS.acentoAzul,
                  labelColor: () => COLORS.grisTexto,
                }}
                style={styles.chart}
              />
            </View>
            <View style={styles.card}>
              <Text style={styles.h}>Top repartidores (entregas)</Text>
              {stats.topRepartidores.length === 0 ? (
                <Text style={styles.text}>Sin datos.</Text>
              ) : (
                stats.topRepartidores.map((r) => (
                  <Text key={r.id} style={styles.text}>
                    · {r.nombre}: {r.entregas}
                  </Text>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  topRow: { alignItems: 'flex-start', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  errorCard: { borderWidth: 1, borderColor: '#e06a6a', backgroundColor: '#fff3f3' },
  text: { fontFamily: 'Poppins_600SemiBold' },
  h: { fontFamily: 'Poppins_700Bold', marginBottom: 8 },
  chart: { borderRadius: 12, marginVertical: 8 },
});
