import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { listarPagosAdmin, METODO_LABEL, type MetodoPago, type PagoLista } from '@/services/pagosApi';
import { listarRepartidoresAdmin } from '@/services/adminRepartidores';
import type { Usuario } from '@/types';

const METODO_ICONO: Record<MetodoPago, string> = {
  efectivo: 'payments',
  transferencia: 'swap-horiz',
  cheque: 'article',
  otro: 'more-horiz',
};

export default function CobrosAdmin() {
  const [pagos, setPagos] = useState<PagoLista[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [repartidores, setRepartidores] = useState<Usuario[]>([]);
  const [filtroRepartidor, setFiltroRepartidor] = useState<string | null>(null);
  const [filtroMetodo, setFiltroMetodo] = useState<MetodoPago | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([
      listarPagosAdmin({
        repartidorId: filtroRepartidor ?? undefined,
        metodo: filtroMetodo ?? undefined,
      }),
      listarRepartidoresAdmin(),
    ])
      .then(([data, reps]) => {
        setPagos(data.pagos);
        setTotal(data.total);
        setRepartidores(reps.filter((r) => r.activo && (r.rol === 'repartidor' || r.rol === 'logistica')));
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [filtroRepartidor, filtroMetodo]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const METODOS: (MetodoPago | null)[] = [null, 'efectivo', 'transferencia', 'cheque', 'otro'];

  return (
    <Screen title="Cobros" subtitle="Pagos registrados por los repartidores" scrollable>

      {/* Resumen */}
      {!cargando && pagos.length > 0 ? (
        <View style={styles.resumenCard}>
          <Text style={styles.resumenLabel}>{pagos.length} cobro(s) · Total</Text>
          <Text style={styles.resumenTotal}>${total.toFixed(2)}</Text>
        </View>
      ) : null}

      {/* Filtro por repartidor */}
      {repartidores.length > 1 ? (
        <View style={styles.filtroBloque}>
          <Text style={styles.filtroLabel}>Repartidor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable
              style={[styles.chip, !filtroRepartidor && styles.chipActivo]}
              onPress={() => setFiltroRepartidor(null)}
            >
              <Text style={[styles.chipTxt, !filtroRepartidor && styles.chipTxtActivo]}>Todos</Text>
            </Pressable>
            {repartidores.map((r) => (
              <Pressable
                key={r.id}
                style={[styles.chip, filtroRepartidor === r.id && styles.chipActivo]}
                onPress={() => setFiltroRepartidor(r.id === filtroRepartidor ? null : r.id)}
              >
                <Text style={[styles.chipTxt, filtroRepartidor === r.id && styles.chipTxtActivo]}>{r.nombre}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Filtro por método */}
      <View style={styles.filtroBloque}>
        <Text style={styles.filtroLabel}>Forma de pago</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {METODOS.map((m) => (
            <Pressable
              key={m ?? 'todos'}
              style={[styles.chip, filtroMetodo === m && styles.chipActivo]}
              onPress={() => setFiltroMetodo(m)}
            >
              <Text style={[styles.chipTxt, filtroMetodo === m && styles.chipTxtActivo]}>
                {m ? METODO_LABEL[m] : 'Todos'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Lista */}
      {cargando ? (
        <ActivityIndicator color={COLORS.verdePrincipal} style={{ marginTop: 24 }} />
      ) : pagos.length === 0 ? (
        <View style={styles.vacio}>
          <MaterialIcons name="inbox" size={40} color={COLORS.grisSecundario} />
          <Text style={styles.vacioTxt}>No hay cobros registrados.</Text>
        </View>
      ) : (
        pagos.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.clienteNombre}>{p.clienteNombre}</Text>
                <View style={styles.repartidorRow}>
                  <MaterialIcons name="person" size={12} color={COLORS.acentoAzul} />
                  <Text style={styles.repartidorNombre}>{p.repartidorNombre}</Text>
                </View>
              </View>
              <Text style={styles.monto}>${Number(p.monto).toFixed(2)}</Text>
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.metodoBadge}>
                <MaterialIcons
                  name={METODO_ICONO[p.metodo] as any}
                  size={13}
                  color={COLORS.verdeOscuro}
                />
                <Text style={styles.metodoTexto}>{METODO_LABEL[p.metodo]}</Text>
              </View>

              {p.metodo === 'cheque' && (p.numeroCheque || p.banco) ? (
                <Text style={styles.chequeDetalle}>
                  {[p.numeroCheque ? `N° ${p.numeroCheque}` : null, p.banco].filter(Boolean).join(' · ')}
                </Text>
              ) : null}

              <Text style={styles.fecha}>
                {new Date(p.creadoEn).toLocaleDateString('es-AR')} {new Date(p.creadoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {p.observaciones ? (
              <Text style={styles.obs}>{p.observaciones}</Text>
            ) : null}
          </View>
        ))
      )}

    </Screen>
  );
}

const styles = StyleSheet.create({
  resumenCard: {
    backgroundColor: COLORS.verdeOscuro,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  resumenLabel: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  resumenTotal: { fontFamily: 'Poppins_800ExtraBold', fontSize: 28, color: '#fff' },
  filtroBloque: { gap: 6 },
  filtroLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisSecundario },
  chips: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8ed' },
  chipActivo: { backgroundColor: COLORS.verdePrincipal, borderColor: COLORS.verdeOscuro },
  chipTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisTexto },
  chipTxtActivo: { color: '#fff' },
  vacio: { alignItems: 'center', gap: 8, marginTop: 32 },
  vacioTxt: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: '#e8ecef' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  clienteNombre: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: COLORS.grisTexto },
  repartidorRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  repartidorNombre: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.acentoAzul },
  monto: { fontFamily: 'Poppins_800ExtraBold', fontSize: 20, color: COLORS.exito },
  cardFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metodoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e8f5e0', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  metodoTexto: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: COLORS.verdeOscuro },
  chequeDetalle: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario },
  fecha: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario, marginLeft: 'auto' },
  obs: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario, fontStyle: 'italic', paddingTop: 2, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
});
