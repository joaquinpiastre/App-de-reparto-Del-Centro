import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS } from '@/constants/colors';
import {
  obtenerDashboardInicio,
  type CombustibleRepartidorStat,
  type DashboardInicioResponse,
  type TipoVehiculo,
} from '@/services/adminReportes';
import { actualizarRepartidorAdmin } from '@/services/adminRepartidores';

const chartW = Dimensions.get('window').width - 48;

const COLOR_MEDALLA = ['#F2C200', '#B8C0C8', '#D08A4E'];
const COLOR_RANK_DEFAULT = '#E8ECEF';

function formatHoras(minutos: number): string {
  const horas = minutos / 60;
  if (horas < 10) return `${Math.round(horas * 10) / 10} h`;
  return `${Math.round(horas)} h`;
}

function VehiculoSelector({
  valor,
  ocupado,
  onCambiar,
}: {
  valor: TipoVehiculo;
  ocupado: boolean;
  onCambiar: (tipo: TipoVehiculo) => void;
}) {
  return (
    <View style={styles.vehiculoRow}>
      <Pressable
        onPress={() => onCambiar('moto')}
        disabled={ocupado}
        style={[styles.vehiculoChip, valor === 'moto' && styles.vehiculoChipOn]}
      >
        <MaterialIcons
          name="two-wheeler"
          size={16}
          color={valor === 'moto' ? COLORS.verdeOscuro : COLORS.grisSecundario}
        />
        <Text style={[styles.vehiculoTxt, valor === 'moto' && styles.vehiculoTxtOn]}>Moto</Text>
      </Pressable>
      <Pressable
        onPress={() => onCambiar('auto')}
        disabled={ocupado}
        style={[styles.vehiculoChip, valor === 'auto' && styles.vehiculoChipOn]}
      >
        <MaterialIcons
          name="directions-car"
          size={16}
          color={valor === 'auto' ? COLORS.verdeOscuro : COLORS.grisSecundario}
        />
        <Text style={[styles.vehiculoTxt, valor === 'auto' && styles.vehiculoTxtOn]}>Auto</Text>
      </Pressable>
    </View>
  );
}

function FilaRepartidor({
  repartidor,
  ocupado,
  onCambiar,
}: {
  repartidor: CombustibleRepartidorStat;
  ocupado: boolean;
  onCambiar: (id: string, tipo: TipoVehiculo) => void;
}) {
  return (
    <View style={styles.repRow}>
      <View style={styles.repInfo}>
        <Text style={styles.repNombre} numberOfLines={1}>
          {repartidor.nombre}
        </Text>
        <Text style={styles.repSub}>
          {formatHoras(repartidor.minutosEnRuta)} en ruta · ≈ {repartidor.litrosEstimados} L de nafta
        </Text>
      </View>
      <VehiculoSelector
        valor={repartidor.tipoVehiculo}
        ocupado={ocupado}
        onCambiar={(tipo) => onCambiar(repartidor.id, tipo)}
      />
    </View>
  );
}

export function DashboardInicio() {
  const [data, setData] = useState<DashboardInicioResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await obtenerDashboardInicio();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const cambiarVehiculo = async (id: string, tipoVehiculo: TipoVehiculo) => {
    if (actualizandoId) return;
    const actual = data?.combustible.porRepartidor.find((r) => r.id === id);
    if (!actual || actual.tipoVehiculo === tipoVehiculo) return;
    try {
      setActualizandoId(id);
      setError(null);
      await actualizarRepartidorAdmin(id, { tipoVehiculo });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el vehículo del repartidor.');
    } finally {
      setActualizandoId(null);
    }
  };

  const maxVisitas = useMemo(
    () => (data?.topClientes ?? []).reduce((acc, c) => Math.max(acc, c.visitas), 0),
    [data]
  );

  const maxVisitasDia = useMemo(
    () => (data?.visitasPorDia.valores ?? []).reduce((acc, v) => Math.max(acc, v), 0),
    [data]
  );

  if (loading && !data) {
    return (
      <View style={styles.card}>
        <Text style={styles.sub}>Cargando estadísticas…</Text>
      </View>
    );
  }

  if (!data) {
    return error ? (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.sub}>{error}</Text>
      </View>
    ) : null;
  }

  return (
    <>
      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.sub}>{error}</Text>
        </View>
      ) : null}

      {/* Ranking de clientes más visitados */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="emoji-events" size={22} color="#E8A400" />
          <Text style={styles.cardTitle}>Ranking de clientes más visitados</Text>
        </View>
        {data.topClientes.length === 0 ? (
          <Text style={styles.sub}>Todavía no hay visitas entregadas registradas.</Text>
        ) : (
          data.topClientes.map((c, i) => (
            <View key={c.id} style={[styles.rankRow, i === data.topClientes.length - 1 && styles.rankRowLast]}>
              <View style={[styles.rankBadge, { backgroundColor: COLOR_MEDALLA[i] ?? COLOR_RANK_DEFAULT }]}>
                <Text style={[styles.rankNumber, i > 2 && styles.rankNumberDark]}>{i + 1}</Text>
              </View>
              <View style={styles.rankInfo}>
                <View style={styles.rankNombreRow}>
                  <Text style={styles.rankNombre} numberOfLines={1}>
                    {c.nombre}
                  </Text>
                  {c.tipo === 'taller' ? (
                    <View style={styles.rankBadgeTaller}>
                      <Text style={styles.rankBadgeTallerTxt}>Taller</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.rankDireccion} numberOfLines={1}>
                  {c.direccion}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${maxVisitas ? Math.max(6, (c.visitas / maxVisitas) * 100) : 0}%` },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.rankVisitasWrap}>
                <Text style={styles.rankVisitas}>{c.visitas}</Text>
                <Text style={styles.rankVisitasLabel}>{c.visitas === 1 ? 'visita' : 'visitas'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Consumo estimado de combustible */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="local-gas-station" size={22} color={COLORS.acentoNaranja} />
          <Text style={styles.cardTitle}>Consumo estimado de combustible</Text>
        </View>
        <Text style={styles.sub}>
          Elegí el vehículo de cada repartidor para estimar cuánta nafta gasta según el tiempo que pasa en
          ruta. Es un cálculo aproximado (moto ≈ 0,9 L/h · auto ≈ 2,6 L/h en ciudad).
        </Text>
        {data.combustible.porRepartidor.length === 0 ? (
          <Text style={styles.sub}>Todavía no hay jornadas cerradas para estimar el consumo.</Text>
        ) : (
          <>
            <View style={styles.totalCombustible}>
              <MaterialIcons name="opacity" size={18} color={COLORS.acentoNaranja} />
              <Text style={styles.totalCombustibleTxt}>
                ≈ {data.combustible.totalLitrosEstimados} L de nafta en total entre todos los repartidores
              </Text>
            </View>
            {data.combustible.porRepartidor.map((r) => (
              <FilaRepartidor
                key={r.id}
                repartidor={r}
                ocupado={actualizandoId === r.id}
                onCambiar={cambiarVehiculo}
              />
            ))}
          </>
        )}
      </View>

      {/* Visitas por día de la semana */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="calendar-today" size={22} color={COLORS.acentoAzul} />
          <Text style={styles.cardTitle}>Visitas entregadas por día</Text>
        </View>
        <Text style={styles.sub}>Qué días de la semana se concentran más entregas, para planificar mejor las rutas.</Text>
        {maxVisitasDia === 0 ? (
          <Text style={styles.sub}>Todavía no hay entregas registradas para graficar.</Text>
        ) : (
          <BarChart
            data={{
              labels: data.visitasPorDia.labels,
              datasets: [{ data: data.visitasPorDia.valores }],
            }}
            width={chartW}
            height={200}
            yAxisLabel=""
            yAxisSuffix=""
            fromZero
            chartConfig={{
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(74, 143, 20, ${opacity})`,
              labelColor: () => COLORS.grisTexto,
              barPercentage: 0.6,
            }}
            style={styles.chart}
          />
        )}
      </View>

      {/* Tiempo promedio por visita */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="timer" size={22} color={COLORS.verdeOscuro} />
          <Text style={styles.cardTitle}>Tiempo promedio por visita</Text>
        </View>
        <Text style={styles.stat}>
          {data.promedioParadaMinutos > 0 ? `${data.promedioParadaMinutos} min` : 'Sin datos'}
        </Text>
        <Text style={styles.sub}>Promedio de minutos que un repartidor permanece en cada cliente al entregar.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e8ecef',
  },
  errorCard: { borderWidth: 1, borderColor: '#e06a6a', backgroundColor: '#fff3f3' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: COLORS.grisTexto, flexShrink: 1 },
  stat: { fontFamily: 'Poppins_800ExtraBold', fontSize: 22, color: COLORS.grisTexto },
  sub: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario, lineHeight: 18 },
  chart: { borderRadius: 12, marginTop: 8, alignSelf: 'center' },

  // Ranking
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f4',
  },
  rankRowLast: { borderBottomWidth: 0 },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: { fontFamily: 'Poppins_800ExtraBold', fontSize: 14, color: '#fff' },
  rankNumberDark: { color: COLORS.grisTexto },
  rankInfo: { flex: 1, gap: 4 },
  rankNombreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankNombre: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto, flexShrink: 1 },
  rankDireccion: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  rankBadgeTaller: {
    backgroundColor: '#e7f1fb',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rankBadgeTallerTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: COLORS.acentoAzul },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#eef1f3',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: COLORS.verdePrincipal,
  },
  rankVisitasWrap: { alignItems: 'center', minWidth: 46 },
  rankVisitas: { fontFamily: 'Poppins_800ExtraBold', fontSize: 18, color: COLORS.verdeOscuro },
  rankVisitasLabel: { fontFamily: 'Poppins_400Regular', fontSize: 10, color: COLORS.grisSecundario },

  // Combustible
  totalCombustible: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff4ed',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  totalCombustibleTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.acentoNaranja, flexShrink: 1 },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f2f4',
  },
  repInfo: { flex: 1, gap: 2 },
  repNombre: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  repSub: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  vehiculoRow: { flexDirection: 'row', gap: 6 },
  vehiculoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c8d4cc',
    backgroundColor: '#fff',
  },
  vehiculoChipOn: { borderColor: COLORS.verdeOscuro, backgroundColor: '#ecfdf3' },
  vehiculoTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisSecundario },
  vehiculoTxtOn: { color: COLORS.verdeOscuro },
});
