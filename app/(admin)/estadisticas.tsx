import { useMemo } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { useHistorialStore } from '@/store/useHistorialStore';

const chartW = Dimensions.get('window').width - 48;

export default function Estadisticas() {
  const cierres = useHistorialStore((s) => s.cierres);

  const { labels, entregas, minutos } = useMemo(() => {
    const slice = cierres.slice(0, 6).reverse();
    return {
      labels: slice.map((_, i) => `${i + 1}`),
      entregas: slice.map((c) => c.completados),
      minutos: slice.map((c) => c.minutosEnRuta),
    };
  }, [cierres]);

  return (
    <Screen title="Estadísticas" subtitle="Últimos cierres (demo local)">
      <ScrollView>
        {cierres.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.text}>Todavía no hay datos. Cerrá un turno en la app repartidor.</Text>
          </View>
        ) : (
          <>
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
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  text: { fontFamily: 'Poppins_600SemiBold' },
  h: { fontFamily: 'Poppins_700Bold', marginBottom: 8 },
  chart: { borderRadius: 12, marginVertical: 8 },
});
