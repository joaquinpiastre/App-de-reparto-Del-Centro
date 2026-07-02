import { useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { obtenerStatsAdmin, type AdminStatsResponse } from '@/services/adminReportes';
import { obtenerCobrosStats, type CobrosStatsResponse } from '@/services/pagosApi';

const chartW = Dimensions.get('window').width - 48;

const PIE_COLORS = [
  '#2E7D32', '#1565C0', '#E65100', '#6A1B9A', '#00695C',
  '#AD1457', '#F57F17', '#37474F',
];

function fmt(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function Estadisticas() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [cobros, setCobros] = useState<CobrosStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const [dataStats, dataCobros] = await Promise.all([
        obtenerStatsAdmin(),
        obtenerCobrosStats(),
      ]);
      setStats(dataStats);
      setCobros(dataCobros);
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

  const pieData = useMemo(() => {
    if (!cobros || cobros.porCliente.length === 0) return [];
    return cobros.porCliente.map((c, i) => ({
      name: c.nombre.length > 14 ? c.nombre.slice(0, 13) + '…' : c.nombre,
      population: c.total,
      color: PIE_COLORS[i % PIE_COLORS.length]!,
      legendFontColor: COLORS.grisTexto,
      legendFontSize: 11,
    }));
  }, [cobros]);

  return (
    <Screen title="Estadísticas" subtitle="Métricas reales desde backend" scrollable>
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

        {/* ── Sección de cobros ── */}
        <View style={styles.card}>
          <Text style={styles.h}>Cobros registrados</Text>
          {!cobros || cobros.porCliente.length === 0 ? (
            <Text style={styles.text}>Todavía no hay cobros registrados.</Text>
          ) : (
            <>
              <Text style={styles.totalCobros}>Total cobrado: {fmt(cobros.totalGeneral)}</Text>

              <PieChart
                data={pieData}
                width={chartW}
                height={200}
                chartConfig={{
                  color: () => '#000',
                  labelColor: () => COLORS.grisTexto,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="8"
                style={styles.chart}
              />

              {/* Lista con números reales */}
              <View style={styles.cobrosLista}>
                {cobros.porCliente.map((c, i) => (
                  <View key={c.nombre} style={styles.cobrosRow}>
                    <View style={[styles.colorDot, { backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }]} />
                    <Text style={styles.cobrosNombre} numberOfLines={1}>{c.nombre}</Text>
                    <Text style={styles.cobrosTotal}>{fmt(c.total)}</Text>
                  </View>
                ))}
              </View>

              {cobros.porRepartidor.length > 0 && (
                <>
                  <Text style={[styles.h, { marginTop: 16 }]}>Por repartidor</Text>
                  {cobros.porRepartidor.map((r) => (
                    <View key={r.nombre} style={styles.cobrosRow}>
                      <Text style={styles.cobrosNombre} numberOfLines={1}>{r.nombre}</Text>
                      <Text style={styles.cobrosTotal}>{fmt(r.total)}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </View>
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
  totalCobros: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: COLORS.verdeOscuro,
    marginBottom: 8,
  },
  cobrosLista: { gap: 6, marginTop: 4 },
  cobrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cobrosNombre: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisTexto,
  },
  cobrosTotal: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: COLORS.grisTexto,
  },
});
