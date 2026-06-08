import { useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';

import { COLORS } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import {
  obtenerDashboardInicio,
  guardarReporteMensual,
  obtenerHistorialMensual,
  type CombustibleRepartidorStat,
  type DashboardInicioResponse,
  type ReporteMensualGuardado,
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

function fmtFechaCorta(ms: number): string {
  const d = new Date(ms);
  const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} ${hora}`;
}

function generarHTMLReporteMensual(reporte: ReporteMensualGuardado): string {
  const { datos } = reporte;

  const filasRanking = datos.topClientes
    .map(
      (c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${c.nombre}${c.tipo === 'taller' ? ' <span class="badge">Taller</span>' : ''}</td>
          <td>${c.direccion}</td>
          <td class="num">${c.visitas}</td>
        </tr>`
    )
    .join('');

  const filasCombustible = datos.combustible.porRepartidor
    .map(
      (r) => `
        <tr>
          <td>${r.nombre}</td>
          <td>${r.tipoVehiculo === 'auto' ? 'Auto' : 'Moto'}</td>
          <td class="num">${formatHoras(r.minutosEnRuta)}</td>
          <td class="num">≈ ${r.litrosEstimados} L</td>
        </tr>`
    )
    .join('');

  const maxDia = Math.max(1, ...datos.visitasPorDia.valores);
  const barras = datos.visitasPorDia.labels
    .map((lbl, i) => {
      const v = datos.visitasPorDia.valores[i] ?? 0;
      const alto = Math.round((v / maxDia) * 100);
      return `
        <div class="barCol">
          <span class="barVal">${v}</span>
          <div class="barWrap"><div class="bar" style="height:${alto}%"></div></div>
          <span class="barLbl">${lbl}</span>
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #2b2f33; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      h2 { font-size: 14px; margin: 22px 0 8px; color: #2f6b1e; }
      .sub { color: #6b7680; font-size: 12px; margin: 0; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e8ecef; }
      th { color: #6b7680; font-weight: 600; text-transform: uppercase; font-size: 10px; }
      td.num, th.num { text-align: right; }
      .badge { background: #e7f1fb; color: #2f6f9e; border-radius: 999px; padding: 1px 6px; font-size: 10px; }
      .statBox { display: inline-block; background: #f3f8f0; border-radius: 12px; padding: 10px 18px; margin-top: 6px; }
      .statBox b { font-size: 20px; color: #2f6b1e; }
      .barsRow { display: flex; align-items: flex-end; gap: 10px; margin-top: 10px; height: 130px; }
      .barCol { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
      .barVal { font-size: 11px; font-weight: bold; margin-bottom: 4px; }
      .barWrap { flex: 1; display: flex; align-items: flex-end; width: 100%; max-width: 26px; }
      .bar { width: 100%; background: #4a8f14; border-radius: 4px 4px 0 0; min-height: 2px; }
      .barLbl { font-size: 10px; color: #6b7680; margin-top: 4px; }
      .footer { margin-top: 26px; font-size: 10px; color: #9aa3ab; }
    </style>
  </head>
  <body>
    <h1>Estadísticas — ${reporte.etiqueta}</h1>
    <p class="sub">Reporte guardado el ${fmtFechaCorta(reporte.guardadoEn)} · Del Centro Pinturerías</p>

    <h2>Ranking de clientes más visitados</h2>
    ${
      datos.topClientes.length
        ? `<table><thead><tr><th>#</th><th>Cliente</th><th>Dirección</th><th class="num">Visitas</th></tr></thead><tbody>${filasRanking}</tbody></table>`
        : '<p class="sub">Sin visitas registradas en el período.</p>'
    }

    <h2>Consumo estimado de combustible</h2>
    ${
      datos.combustible.porRepartidor.length
        ? `<table><thead><tr><th>Repartidor</th><th>Vehículo</th><th class="num">Tiempo en ruta</th><th class="num">Nafta estimada</th></tr></thead><tbody>${filasCombustible}</tbody></table>
           <div class="statBox">Total estimado: <b>≈ ${datos.combustible.totalLitrosEstimados} L</b> de nafta</div>`
        : '<p class="sub">Sin jornadas cerradas en el período.</p>'
    }

    <h2>Visitas entregadas por día de la semana</h2>
    <div class="barsRow">${barras}</div>

    <h2>Tiempo promedio por visita</h2>
    <div class="statBox"><b>${datos.promedioParadaMinutos > 0 ? `${datos.promedioParadaMinutos} min` : 'Sin datos'}</b></div>

    <p class="footer">Generado automáticamente por la app Del Centro · ${reporte.etiqueta}</p>
  </body>
  </html>`;
}

async function descargarReportePDF(reporte: ReporteMensualGuardado) {
  try {
    const html = generarHTMLReporteMensual(reporte);
    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
      }
    } else {
      await Print.printAsync({ html });
    }
  } catch {
    Alert.alert('Error', 'No se pudo generar el PDF del reporte.');
  }
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
  const [historial, setHistorial] = useState<ReporteMensualGuardado[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, hist] = await Promise.all([obtenerDashboardInicio(), obtenerHistorialMensual()]);
      setData(res);
      setHistorial(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  useEffect(() => {
    if (!guardadoOk) return;
    const t = setTimeout(() => setGuardadoOk(false), 4000);
    return () => clearTimeout(t);
  }, [guardadoOk]);

  const guardarMes = async () => {
    if (guardando) return;
    try {
      setGuardando(true);
      setError(null);
      setGuardadoOk(false);
      const reporte = await guardarReporteMensual();
      setHistorial((prev) => [reporte, ...prev.filter((r) => r.id !== reporte.id)]);
      setGuardadoOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el reporte del mes.');
    } finally {
      setGuardando(false);
    }
  };

  const descargarReporte = async (reporte: ReporteMensualGuardado) => {
    if (descargandoId) return;
    setDescargandoId(reporte.id);
    await descargarReportePDF(reporte);
    setDescargandoId(null);
  };

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
        <Text style={styles.sub}>
          Entregas completadas en {data.periodo.etiqueta}
          {data.topClientes.length > 4 ? ' · deslizá la lista para ver a todos los clientes' : ''}.
        </Text>
        {data.topClientes.length === 0 ? (
          <Text style={styles.sub}>Todavía no hay visitas entregadas registradas.</Text>
        ) : (
          <ScrollView
            style={styles.rankScroll}
            contentContainerStyle={styles.rankScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {data.topClientes.map((c, i) => (
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
            ))}
          </ScrollView>
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

      {/* Guardar estadísticas del mes */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="save-alt" size={22} color={COLORS.verdeOscuro} />
          <Text style={styles.cardTitle}>Estadísticas mensuales</Text>
        </View>
        <Text style={styles.sub}>
          Estos números corresponden a {data.periodo.etiqueta} y se reinician solos al empezar un mes
          nuevo. Guardalos para conservar un registro histórico que después podés descargar en PDF.
        </Text>
        <Button
          label={guardando ? 'Guardando…' : `Guardar estadísticas de ${data.periodo.etiqueta}`}
          onPress={guardarMes}
          loading={guardando}
        />
        {guardadoOk ? (
          <View style={styles.okBanner}>
            <MaterialIcons name="check-circle" size={16} color={COLORS.verdeOscuro} />
            <Text style={styles.okTxt}>Estadísticas de {data.periodo.etiqueta} guardadas correctamente.</Text>
          </View>
        ) : null}
      </View>

      {/* Historial de reportes guardados */}
      {historial.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="history" size={22} color={COLORS.acentoAzul} />
            <Text style={styles.cardTitle}>Reportes guardados</Text>
          </View>
          <Text style={styles.sub}>Descargá en PDF las estadísticas de los meses que ya guardaste.</Text>
          {historial.map((r, i) => (
            <View key={r.id} style={[styles.historialRow, i === historial.length - 1 && styles.rankRowLast]}>
              <View style={styles.historialInfo}>
                <Text style={styles.historialEtiqueta}>{r.etiqueta}</Text>
                <Text style={styles.historialFecha}>Guardado el {fmtFechaCorta(r.guardadoEn)}</Text>
              </View>
              <Pressable
                style={[styles.pdfBtn, descargandoId === r.id && styles.pdfBtnOcupado]}
                disabled={descargandoId === r.id}
                onPress={() => descargarReporte(r)}
              >
                <MaterialIcons name="picture-as-pdf" size={15} color="#fff" />
                <Text style={styles.pdfBtnTxt}>{descargandoId === r.id ? 'Generando…' : 'Descargar PDF'}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
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
  rankScroll: { maxHeight: 300, marginTop: 2 },
  rankScrollContent: { paddingRight: 2 },
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f2f4',
  },
  repInfo: { flexGrow: 1, flexShrink: 1, minWidth: 150, gap: 2 },
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

  // Estadísticas mensuales / historial
  okBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf3',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  okTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.verdeOscuro, flexShrink: 1 },
  historialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f4',
  },
  historialInfo: { flexGrow: 1, flexShrink: 1, minWidth: 140, gap: 2 },
  historialEtiqueta: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  historialFecha: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.acentoAzul,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pdfBtnOcupado: { opacity: 0.6 },
  pdfBtnTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#fff' },
});
