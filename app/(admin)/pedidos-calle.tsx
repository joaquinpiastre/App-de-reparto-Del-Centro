import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { isFirebaseConfigured } from '@/services/firebase';
import { actualizarEstadoPedidoCalle } from '@/services/pedidosCalle';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import type { PedidoCalle } from '@/types';

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
  const lista = usePedidosCalleStore((s) => s.pedidos);

  return (
    <Screen title="Pedidos en calle" subtitle="Levantados por repartidores">
      <Text style={styles.hint}>
        {isFirebaseConfigured()
          ? 'Sincronizado con Firebase. Los pedidos nuevos disparan una notificación local en este dispositivo.'
          : 'Modo local: los pedidos se guardan en este dispositivo/navegador. En móvil con Firebase configurado se sincronizan en la nube; el panel web usa almacenamiento local hasta integrar API o SDK compatible con el navegador.'}
      </Text>
      <FlatList
        style={styles.list}
        data={lista}
        keyExtractor={(item: PedidoCalle) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.empty}>Todavía no hay pedidos.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>
              {item.calleMostrada} · {fmtFecha(item.creadoEn)}
            </Text>
            <Text style={styles.row}>
              {item.repartidorNombre} · {item.estado} · Total ${item.total.toFixed(2)}
            </Text>
            {item.clientesMismaCalle.length > 0 ? (
              <Text style={styles.row}>
                Paradas misma calle:{' '}
                {item.clientesMismaCalle.map((c) => c.nombre).join(', ')}
              </Text>
            ) : null}
            {item.items.map((l, i) => (
              <Text key={`${item.id}-l-${i}`} style={styles.itemLine}>
                {l.cantidad} × {l.descripcion} (${l.subtotal.toFixed(2)})
              </Text>
            ))}
            {item.notas ? <Text style={styles.notas}>Nota: {item.notas}</Text> : null}
            {item.estado === 'pendiente' ? (
              <View style={styles.actions}>
                <Button
                  label="Marcar visto"
                  variant="secondary"
                  onPress={() => void actualizarEstadoPedidoCalle(item.id, 'visto')}
                />
                <Button
                  label="Armado / listo"
                  onPress={() => void actualizarEstadoPedidoCalle(item.id, 'armado')}
                />
              </View>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 0 },
  hint: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginBottom: 8 },
  empty: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario, marginTop: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  title: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto },
  row: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginTop: 4 },
  itemLine: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginTop: 2 },
  notas: { fontFamily: 'Poppins_600SemiBold', color: COLORS.verdeOscuro, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
