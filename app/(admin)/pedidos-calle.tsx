import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { DEMO_REPARTIDOR_USER } from '@/constants/demoAuth';
import {
  actualizarEstadoPedidoAdmin,
  crearPedidoAdmin,
  obtenerRepartidoresDisponibles,
  suscribirAdminPedidos,
} from '@/services/adminPedidos';
import { useAppStore } from '@/store/useAppStore';
import { useAdminPedidosStore } from '@/store/useAdminPedidosStore';
import type { EstadoPedidoAdmin, PedidoAdmin, PedidoAdminItem, Usuario } from '@/types';

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

const ESTADOS_FLUJO: EstadoPedidoAdmin[] = ['pendiente', 'asignado', 'en_ruta', 'entregado'];

export default function PedidosCalleAdmin() {
  const lista = useAdminPedidosStore((s) => s.pedidos);
  const usuario = useAppStore((s) => s.usuario);
  const [repartidores, setRepartidores] = useState<Usuario[]>([]);

  const [titulo, setTitulo] = useState('');
  const [callesRaw, setCallesRaw] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('');
  const [items, setItems] = useState<PedidoAdminItem[]>([]);
  const [notas, setNotas] = useState('');
  const [repartidorId, setRepartidorId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);

  const avisar = (titulo: string, msg: string, tipo: 'ok' | 'error' = 'error') => {
    setFeedback({ tipo, msg });
    if (Platform.OS === 'web') {
      if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
        globalThis.alert(`${titulo}\n${msg}`);
      }
      return;
    }
    Alert.alert(titulo, msg);
  };

  useEffect(() => suscribirAdminPedidos(() => {}), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await obtenerRepartidoresDisponibles();
        if (!mounted) return;
        if (list.length > 0) {
          setRepartidores(list);
          setRepartidorId((prev) => prev || list[0].id);
          return;
        }
      } catch {}
      const fallback: Usuario = {
        id: `usr-${DEMO_REPARTIDOR_USER}`,
        nombre: 'Carlos',
        rol: 'repartidor',
        activo: true,
      };
      setRepartidores([fallback]);
      setRepartidorId((prev) => prev || fallback.id);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const total = useMemo(() => items.reduce((acc, x) => acc + x.subtotal, 0), [items]);

  const agregarItem = () => {
    const n = Math.max(1, parseInt(cantidad, 10) || 1);
    const p = Number(precio.replace(',', '.'));
    if (!descripcion.trim()) {
      Alert.alert('Producto', 'Ingresá la descripción del producto.');
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      Alert.alert('Producto', 'Ingresá un precio válido.');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        descripcion: descripcion.trim(),
        cantidad: n,
        precioUnitario: p,
        subtotal: Math.round(n * p * 100) / 100,
      },
    ]);
    setDescripcion('');
    setPrecio('');
    setCantidad('1');
  };

  const guardarPedido = async () => {
    const calles = callesRaw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const repartidor = repartidores.find((r) => r.id === repartidorId);
    if (!titulo.trim()) {
      avisar('Pedido', 'Definí un título para el pedido.');
      return;
    }
    if (calles.length === 0) {
      avisar('Pedido', 'Ingresá al menos una calle.');
      return;
    }
    if (!repartidor) {
      avisar('Pedido', 'Seleccioná un repartidor.');
      return;
    }
    if (items.length === 0) {
      avisar('Pedido', 'Agregá al menos un producto.');
      return;
    }

    try {
      setGuardando(true);
      setFeedback(null);
      const resultados = await Promise.allSettled(
        calles.map((calle) =>
          crearPedidoAdmin({
            titulo: titulo.trim(),
            calles: [calle],
            repartidorId: repartidor.id,
            repartidorNombre: repartidor.nombre,
            items,
            total,
            notas: notas.trim() || undefined,
            estado: 'asignado',
            creadoPorId: usuario?.id,
            creadoPorNombre: usuario?.nombre,
          })
        )
      );
      const creados = resultados.filter((r) => r.status === 'fulfilled').length;
      const fallidos = resultados.length - creados;
      const errores = resultados
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
      const detalleError = errores[0] ?? 'Sin detalle';
      if (creados > 0) {
        setTitulo('');
        setCallesRaw('');
        setItems([]);
        setNotas('');
      }
      if (fallidos === 0) {
        avisar('Listo', `Se crearon ${creados} pedidos (uno por calle).`, 'ok');
      } else {
        avisar(
          'Creación parcial',
          `Se crearon ${creados} pedidos y fallaron ${fallidos}. Motivo: ${detalleError}`,
          'error'
        );
      }
    } catch (e) {
      avisar(
        'Error al crear pedido',
        e instanceof Error
          ? `No se pudo guardar en la API: ${e.message}`
          : 'No se pudo guardar en la API.',
        'error'
      );
    } finally {
      setGuardando(false);
    }
  };

  const avanzarEstado = async (pedido: PedidoAdmin) => {
    const idx = ESTADOS_FLUJO.indexOf(pedido.estado);
    if (idx < 0 || idx >= ESTADOS_FLUJO.length - 1) return;
    const next = ESTADOS_FLUJO[idx + 1];
    try {
      await actualizarEstadoPedidoAdmin(pedido.id, next);
    } catch (e) {
      Alert.alert('Estado', e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    }
  };

  return (
    <Screen title="Gestión de pedidos" subtitle="Admin crea, asigna calles y productos por repartidor">
      {feedback ? (
        <View style={[styles.feedback, feedback.tipo === 'ok' ? styles.feedbackOk : styles.feedbackError]}>
          <Text style={styles.feedbackText}>{feedback.msg}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>Título del pedido</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Reparto zona centro mañana"
          value={titulo}
          onChangeText={setTitulo}
        />
        <Text style={styles.label}>Calles (separadas por coma, se crea 1 pedido por calle)</Text>
        <TextInput
          style={styles.input}
          placeholder="Av. San Martín, Mitre, Yrigoyen"
          value={callesRaw}
          onChangeText={setCallesRaw}
        />
        <Text style={styles.label}>Asignar a repartidor</Text>
        <View style={styles.actions}>
          {repartidores.map((r) => (
            <Button
              key={r.id}
              label={r.nombre}
              variant={repartidorId === r.id ? 'primary' : 'secondary'}
              onPress={() => setRepartidorId(r.id)}
            />
          ))}
        </View>

        <Text style={styles.label}>Producto</Text>
        <TextInput
          style={styles.input}
          placeholder="Descripción"
          value={descripcion}
          onChangeText={setDescripcion}
        />
        <View style={styles.rowInline}>
          <TextInput
            style={[styles.input, styles.inputSmall]}
            placeholder="Cantidad"
            keyboardType="number-pad"
            value={cantidad}
            onChangeText={setCantidad}
          />
          <TextInput
            style={[styles.input, styles.inputSmall]}
            placeholder="Precio unitario"
            keyboardType="decimal-pad"
            value={precio}
            onChangeText={setPrecio}
          />
          <Button label="Agregar" onPress={agregarItem} />
        </View>
        {items.map((it, i) => (
          <Text key={`${it.descripcion}-${i}`} style={styles.itemLine}>
            {it.cantidad} × {it.descripcion} (${it.subtotal.toFixed(2)})
          </Text>
        ))}
        <Text style={styles.total}>Total: ${total.toFixed(2)}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Notas opcionales"
          value={notas}
          onChangeText={setNotas}
          multiline
        />
        <Button
          label={guardando ? 'GUARDANDO…' : 'CREAR Y ASIGNAR PEDIDO'}
          loading={guardando}
          onPress={() => void guardarPedido()}
        />
      </View>

      <FlatList
        style={styles.list}
        data={lista}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.empty}>Todavía no hay pedidos admin.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>
              {item.titulo} · {fmtFecha(item.creadoEn)}
            </Text>
            <Text style={styles.row}>
              {item.repartidorNombre} · Estado: {item.estado} · Total ${item.total.toFixed(2)}
            </Text>
            <Text style={styles.row}>Calles: {item.calles.join(', ')}</Text>
            {item.items.map((l, i) => (
              <Text key={`${item.id}-l-${i}`} style={styles.itemLine}>
                {l.cantidad} × {l.descripcion} (${l.subtotal.toFixed(2)})
              </Text>
            ))}
            {item.notas ? <Text style={styles.notas}>Nota: {item.notas}</Text> : null}
            {item.estado !== 'entregado' && item.estado !== 'cancelado' ? (
              <View style={styles.actions}>
                <Button label="Siguiente estado" onPress={() => void avanzarEstado(item)} />
              </View>
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1 },
  feedbackOk: { backgroundColor: '#ecfdf3', borderColor: '#52c47a' },
  feedbackError: { backgroundColor: '#fff3f3', borderColor: '#e06a6a' },
  feedbackText: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto },
  list: { flex: 1, minHeight: 0 },
  label: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Poppins_400Regular',
    backgroundColor: '#fff',
  },
  inputSmall: { flex: 1 },
  rowInline: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
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
  total: { fontFamily: 'Poppins_700Bold', color: COLORS.verdeOscuro, marginTop: 8 },
  itemLine: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginTop: 2 },
  notas: { fontFamily: 'Poppins_600SemiBold', color: COLORS.verdeOscuro, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
