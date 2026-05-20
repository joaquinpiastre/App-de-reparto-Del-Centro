import { useEffect, useMemo } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { actualizarEstadoPedidoCalle, suscribirPedidosCalle } from '@/services/pedidosCalle';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import type { EstadoPedidoCalle, PedidoCalle } from '@/types';

function fmtFecha(ts: number) {
  try {
    return new Date(ts).toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function PedidosCalleAdmin() {
  const pedidosCalle = usePedidosCalleStore((s) => s.pedidos);

  useEffect(() => suscribirPedidosCalle(() => {}), []);

  const pedidosCalleActivos = useMemo(
    () =>
      [...pedidosCalle]
        .filter((p) => p.estado !== 'retirado' && p.estado !== 'cancelado')
        .sort((a, b) => b.creadoEn - a.creadoEn),
    [pedidosCalle]
  );

  const esEstadoFinal = (e: EstadoPedidoCalle) => e === 'retirado' || e === 'cancelado';

  const cambiarEstado = async (pedido: PedidoCalle, estado: PedidoCalle['estado']) => {
    try {
      await actualizarEstadoPedidoCalle(pedido.id, estado);
    } catch (e) {
      if (Platform.OS === 'web') {
        globalThis.alert?.(`No se pudo actualizar el estado: ${e instanceof Error ? e.message : e}`);
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
      }
    }
  };

  return (
    <Screen
      title="Pedidos en calle"
      subtitle="Pedidos levantados por los repartidores"
    >
      <Text style={styles.resumen}>
        Activos: {pedidosCalleActivos.length} · Total en sistema: {pedidosCalle.length}
      </Text>

      {pedidosCalleActivos.length === 0 ? (
        <Text style={styles.empty}>
          {pedidosCalle.length === 0
            ? 'Todavía no hay pedidos desde la calle.'
            : 'No hay pedidos activos. Los finalizados están en el Historial.'}
        </Text>
      ) : (
        pedidosCalleActivos.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.fecha}>{fmtFecha(p.creadoEn)}</Text>
            <View style={styles.repartidorTag}>
              <Text style={styles.repartidorTagText}>{p.repartidorNombre}</Text>
            </View>
            {p.clienteNombre ? (
              <View style={styles.clienteTag}>
                <Text style={styles.clienteTagText}>{p.clienteNombre}</Text>
              </View>
            ) : null}
            <Text style={styles.titulo}>{p.calleMostrada}</Text>
            <Text style={styles.row}>
              <Text style={styles.estadoBadge}>Estado: {p.estado}</Text>
              {' · '}
              Total ${Number(p.total ?? 0).toFixed(2)}
            </Text>
            {(p.items ?? []).map((it, idx) => (
              <Text key={`${p.id}-it-${idx}`} style={styles.itemLine}>
                {it.cantidad} × {it.descripcion} (${Number(it.subtotal).toFixed(2)})
              </Text>
            ))}
            {p.notas ? <Text style={styles.notas}>Nota repartidor: {p.notas}</Text> : null}
            {p.clientesMismaCalle && p.clientesMismaCalle.length > 0 ? (
              <View style={styles.mismaCalleBox}>
                <Text style={styles.mismaCalleTit}>Clientes en la misma calle (ruta)</Text>
                {p.clientesMismaCalle.map((c) => (
                  <Text key={c.direccion + c.nombre} style={styles.mismaCalleRow}>
                    · {c.nombre} — {c.direccion}
                  </Text>
                ))}
              </View>
            ) : null}
            {!esEstadoFinal(p.estado) ? (
              <View style={[styles.actions, styles.actionsWrap]}>
                <Button
                  label="VISTO"
                  variant="secondary"
                  onPress={() => void cambiarEstado(p, 'visto')}
                />
                <Button
                  label="ARMADO"
                  variant="primary"
                  onPress={() => void cambiarEstado(p, 'armado')}
                />
                <Button
                  label="RETIRADO"
                  variant="warning"
                  onPress={() => void cambiarEstado(p, 'retirado')}
                />
                <Button
                  label="CANCELAR"
                  variant="danger"
                  onPress={() => void cambiarEstado(p, 'cancelado')}
                />
              </View>
            ) : (
              <Text style={styles.finalizadoTxt}>Pedido finalizado — no requiere acción.</Text>
            )}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  resumen: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisSecundario,
    marginBottom: 12,
  },
  empty: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisSecundario,
    marginTop: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  fecha: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    color: COLORS.grisSecundario,
    marginBottom: 4,
  },
  titulo: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto },
  row: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginTop: 4 },
  estadoBadge: { fontFamily: 'Poppins_600SemiBold', color: COLORS.verdeOscuro },
  itemLine: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginTop: 2 },
  notas: { fontFamily: 'Poppins_600SemiBold', color: COLORS.verdeOscuro, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionsWrap: { flexWrap: 'wrap' },
  repartidorTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  repartidorTagText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.verdeOscuro,
  },
  clienteTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  clienteTagText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: '#1565c0',
  },
  mismaCalleBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  mismaCalleTit: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.grisTexto,
    marginBottom: 4,
  },
  mismaCalleRow: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario },
  finalizadoTxt: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: COLORS.grisSecundario,
    marginTop: 12,
    fontStyle: 'italic',
  },
});
