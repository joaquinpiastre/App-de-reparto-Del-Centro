import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { apiRequest } from '@/services/apiClient';

type CategoriaCliente = 'A' | 'B' | 'C' | 'D';

interface ClientePlan {
  id: string;
  nombre: string;
  direccion: string;
  tipo: 'cliente' | 'taller';
  categorias: CategoriaCliente[];
  orden: number;
}

interface RepartidorPlan {
  id: string;
  nombre: string;
  clientes: ClientePlan[];
}

interface DiaPlan {
  categoria: CategoriaCliente;
  repartidores: RepartidorPlan[];
}

interface PlanificacionResponse {
  lunes: DiaPlan;
  martes: DiaPlan;
  miercoles: DiaPlan;
  jueves: DiaPlan;
  viernes: DiaPlan;
  andres: { categoria: 'D'; clientes: ClientePlan[] };
}

type TabKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'andres';

const TABS: { key: TabKey; label: string; corto: string; categoria: CategoriaCliente }[] = [
  { key: 'lunes',     label: 'Lunes',     corto: 'Lun', categoria: 'A' },
  { key: 'martes',    label: 'Martes',    corto: 'Mar', categoria: 'B' },
  { key: 'miercoles', label: 'Miércoles', corto: 'Mié', categoria: 'A' },
  { key: 'jueves',    label: 'Jueves',    corto: 'Jue', categoria: 'B' },
  { key: 'viernes',   label: 'Viernes',   corto: 'Vie', categoria: 'C' },
  { key: 'andres',    label: 'Andrés',    corto: 'And', categoria: 'D' },
];

const CAT_COLOR: Record<CategoriaCliente, string> = {
  A: '#2E7D32',
  B: '#1565C0',
  C: '#E65100',
  D: '#7B1FA2',
};

const CAT_BG: Record<CategoriaCliente, string> = {
  A: '#e8f5e9',
  B: '#e3f2fd',
  C: '#fff3e0',
  D: '#f3e5f5',
};

export default function Planificacion() {
  const [data, setData] = useState<PlanificacionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabActivo, setTabActivo] = useState<TabKey>('lunes');
  const [cargandoSeed, setCargandoSeed] = useState(false);

  const cargar = () => {
    setLoading(true);
    setError(null);
    apiRequest<Omit<PlanificacionResponse, 'andres'> & { andres?: { categoria: 'D'; clientes: ClientePlan[] } }>('/admin/planificacion')
      .then((resp) => {
        // El endpoint devuelve dias + andres viene de /admin/planificacion/andres o calculado client-side
        setData(resp as PlanificacionResponse);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error al cargar.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargar();
  }, []);

  const cargarDatosExcel = () => {
    Alert.alert(
      'Cargar datos del Excel',
      '¿Cargar todos los talleres del Excel de rutas? Los que ya existen se omiten.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cargar',
          onPress: () => {
            setCargandoSeed(true);
            apiRequest<{ ok: boolean; insertados: number; omitidos: number; mensaje: string }>(
              '/admin/seed/rutas',
              { method: 'POST' }
            )
              .then((r) => {
                Alert.alert('Listo', r.mensaje);
                cargar();
              })
              .catch((e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cargar.'))
              .finally(() => setCargandoSeed(false));
          },
        },
      ]
    );
  };

  const tab = TABS.find((t) => t.key === tabActivo)!;
  const cat = tab.categoria;

  // Calcular datos del tab activo
  let totalParadas = 0;
  let repartidores: RepartidorPlan[] = [];
  let clientesAndres: ClientePlan[] = [];
  const esAndres = tabActivo === 'andres';

  if (data) {
    if (!esAndres) {
      const diaPlan = data[tabActivo as keyof Omit<PlanificacionResponse, 'andres'>] as DiaPlan;
      repartidores = diaPlan?.repartidores ?? [];
      totalParadas = repartidores.reduce((s, r) => s + r.clientes.length, 0);
    } else {
      clientesAndres = data.andres?.clientes ?? [];
      totalParadas = clientesAndres.length;
    }
  }

  return (
    <Screen title="Planificación semanal" subtitle="Rutas por día" scrollable>

      {/* Botón de carga inicial */}
      <Button
        label={cargandoSeed ? 'CARGANDO DATOS…' : 'CARGAR DATOS DEL EXCEL'}
        variant="secondary"
        loading={cargandoSeed}
        onPress={cargarDatosExcel}
      />

      {/* Selector de tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}
        contentContainerStyle={styles.tabContent}>
        {TABS.map((t) => {
          const activo = tabActivo === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTabActivo(t.key)}
              style={[styles.tabChip, activo && { borderColor: CAT_COLOR[t.categoria], backgroundColor: CAT_BG[t.categoria] }]}
            >
              <Text style={[styles.tabChipTxt, activo && { color: CAT_COLOR[t.categoria] }]}>
                {t.corto}
              </Text>
              <Text style={[styles.tabChipCat, activo && { color: CAT_COLOR[t.categoria] }]}>
                Cat. {t.categoria}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={COLORS.verdeOscuro} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTxt}>{error}</Text>
          <Button label="REINTENTAR" variant="secondary" onPress={cargar} />
        </View>
      ) : (
        <>
          {/* Cabecera del tab */}
          <View style={[styles.diaHeader, { backgroundColor: CAT_BG[cat] }]}>
            <Text style={[styles.diaHeaderTitulo, { color: CAT_COLOR[cat] }]}>
              {tab.label} — Categoría {cat}
            </Text>
            <Text style={styles.diaHeaderSub}>
              {totalParadas} parada{totalParadas !== 1 ? 's' : ''} en total
            </Text>
          </View>

          {/* Tab Andrés — lista plana */}
          {esAndres ? (
            <View style={styles.repCard}>
              <View style={styles.repHeader}>
                <Text style={[styles.repNombre, { color: CAT_COLOR['D'] }]}>Recorrido Andrés</Text>
                <View style={[styles.repBadge, { backgroundColor: CAT_BG['D'] }]}>
                  <Text style={[styles.repBadgeTxt, { color: CAT_COLOR['D'] }]}>{clientesAndres.length} paradas</Text>
                </View>
              </View>
              {clientesAndres.length === 0 ? (
                <Text style={styles.sinClientes}>Sin talleres asignados a la categoría D.</Text>
              ) : (
                clientesAndres.map((c, idx) => (
                  <ClienteRow key={c.id} c={c} idx={idx} catActiva={cat} />
                ))
              )}
            </View>
          ) : (
            /* Tabs de días — por repartidor */
            repartidores.map((rep) => (
              <View key={rep.id} style={styles.repCard}>
                <View style={styles.repHeader}>
                  <Text style={styles.repNombre}>{rep.nombre}</Text>
                  <View style={styles.repBadge}>
                    <Text style={styles.repBadgeTxt}>{rep.clientes.length} paradas</Text>
                  </View>
                </View>
                {rep.clientes.length === 0 ? (
                  <Text style={styles.sinClientes}>Sin paradas asignadas este día.</Text>
                ) : (
                  rep.clientes.map((c, idx) => (
                    <ClienteRow key={c.id} c={c} idx={idx} catActiva={cat} />
                  ))
                )}
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function ClienteRow({ c, idx, catActiva }: { c: ClientePlan; idx: number; catActiva: CategoriaCliente }) {
  const CAT_COLOR: Record<CategoriaCliente, string> = { A: '#2E7D32', B: '#1565C0', C: '#E65100', D: '#7B1FA2' };
  const CAT_BG: Record<CategoriaCliente, string> = { A: '#e8f5e9', B: '#e3f2fd', C: '#fff3e0', D: '#f3e5f5' };
  const otras = c.categorias.filter((cat) => cat !== catActiva);
  return (
    <View style={styles.clienteRow}>
      <View style={styles.clienteOrden}>
        <Text style={styles.clienteOrdenTxt}>{idx + 1}</Text>
      </View>
      <View style={styles.clienteInfo}>
        <View style={styles.clienteTopRow}>
          <Text style={styles.clienteNombre} numberOfLines={1}>{c.nombre}</Text>
          <View style={[styles.tipoBadge, c.tipo === 'taller' ? styles.tipoBadgeTaller : styles.tipoBadgeCliente]}>
            <Text style={styles.tipoBadgeTxt}>{c.tipo === 'taller' ? 'Taller' : 'Cliente'}</Text>
          </View>
        </View>
        <Text style={styles.clienteDir} numberOfLines={1}>{c.direccion}</Text>
        {otras.length > 0 && (
          <Text style={styles.clienteCats}>
            También:{' '}
            {otras.map((cat) => (
              <Text key={cat} style={{ color: CAT_COLOR[cat], backgroundColor: CAT_BG[cat] }}> {cat} </Text>
            ))}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabScroll: { marginBottom: 12 },
  tabContent: { gap: 8, paddingVertical: 4 },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#c8d4cc',
    backgroundColor: '#fff',
    alignItems: 'center',
    minWidth: 58,
  },
  tabChipTxt: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  tabChipCat: { fontFamily: 'Poppins_400Regular', fontSize: 10, color: COLORS.grisSecundario, marginTop: 1 },
  errorBox: { backgroundColor: '#fff3f3', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e06a6a', gap: 8 },
  errorTxt: { fontFamily: 'Poppins_400Regular', color: '#c0392b' },
  diaHeader: { borderRadius: 12, padding: 14, marginBottom: 12 },
  diaHeaderTitulo: { fontFamily: 'Poppins_700Bold', fontSize: 17, color: COLORS.grisTexto },
  diaHeaderSub: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario, marginTop: 2 },
  repCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e8ecef' },
  repHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  repNombre: { fontFamily: 'Poppins_700Bold', fontSize: 16, color: COLORS.grisTexto, flex: 1 },
  repBadge: { backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  repBadgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisSecundario },
  sinClientes: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, fontSize: 13 },
  clienteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  clienteOrden: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#f0f4f0', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  clienteOrdenTxt: { fontFamily: 'Poppins_700Bold', fontSize: 12, color: COLORS.grisSecundario },
  clienteInfo: { flex: 1 },
  clienteTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clienteNombre: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: COLORS.grisTexto, flex: 1 },
  clienteDir: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, marginTop: 2 },
  clienteCats: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario, marginTop: 2 },
  tipoBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tipoBadgeCliente: { backgroundColor: '#e8f4ea' },
  tipoBadgeTaller: { backgroundColor: '#e3f2fd' },
  tipoBadgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: COLORS.grisTexto },
});
