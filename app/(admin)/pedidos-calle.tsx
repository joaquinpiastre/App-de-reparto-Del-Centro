import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { obtenerCatalogoProductos, reemplazarCatalogoProductos } from '@/services/catalogoProductos';
import { parseListaPreciosDesdeUri } from '@/services/listaPreciosExcel';
import {
  actualizarEstadoPedidoCalle,
  crearPedidoAdmin,
  editarPedidoAdmin,
  eliminarPedidoAdmin,
  obtenerRepartidoresDisponibles,
  asignarPedidoAdmin,
  suscribirAdminPedidos,
} from '@/services/adminPedidos';
import { suscribirPedidosCalle } from '@/services/pedidosCalle';
import { useAppStore } from '@/store/useAppStore';
import { useAdminPedidosStore } from '@/store/useAdminPedidosStore';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import type { PedidoAdmin, PedidoAdminItem, PedidoCalle, Usuario } from '@/types';

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

const REPARTIDOR_SIN_ASIGNAR_ID = 'usr-sin-asignar';
const REPARTIDOR_SIN_ASIGNAR_NOMBRE = 'Sin asignar';

export default function PedidosCalleAdmin() {
  const lista = useAdminPedidosStore((s) => s.pedidos);
  const pedidosCalle = usePedidosCalleStore((s) => s.pedidos);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null);
  const [catalogoMeta, setCatalogoMeta] = useState<{ nombreArchivo: string | null; updatedAt: string | null } | null>(null);
  const [subiendoCatalogo, setSubiendoCatalogo] = useState(false);

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
  useEffect(() => suscribirPedidosCalle(() => {}), []);

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
      setRepartidores([]);
      setRepartidorId('');
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const total = useMemo(() => items.reduce((acc, x) => acc + x.subtotal, 0), [items]);
  const listaPendientes = useMemo(
    () => lista.filter((x) => x.estado === 'pendiente').sort((a, b) => b.creadoEn - a.creadoEn),
    [lista]
  );
  const listaActivos = useMemo(
    () =>
      lista
        .filter((x) => x.estado === 'pendiente' || x.estado === 'asignado' || x.estado === 'en_ruta')
        .sort((a, b) => b.creadoEn - a.creadoEn),
    [lista]
  );
  const pedidosCalleActivos = useMemo(
    () =>
      pedidosCalle
        .filter((p) => p.estado !== 'retirado' && p.estado !== 'cancelado')
        .sort((a, b) => b.creadoEn - a.creadoEn),
    [pedidosCalle]
  );

  useEffect(() => {
    (async () => {
      try {
        const c = await obtenerCatalogoProductos();
        if (!c) return;
        setCatalogoMeta({ nombreArchivo: c.nombreArchivo, updatedAt: c.updatedAt });
      } catch {}
    })();
  }, []);

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

  const importarYSubirCatalogo = async () => {
    try {
      setSubiendoCatalogo(true);
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const asset = res.assets[0];
      const listaExcel = await parseListaPreciosDesdeUri(asset.uri);
      if (listaExcel.length === 0) {
        avisar('Catálogo', 'El Excel no tiene productos válidos.');
        return;
      }
      await reemplazarCatalogoProductos(listaExcel, asset.name ?? undefined);
      setCatalogoMeta({ nombreArchivo: asset.name ?? 'excel', updatedAt: new Date().toISOString() });
      avisar('Catálogo', `Se subieron ${listaExcel.length} productos al catálogo central.`, 'ok');
    } catch (e) {
      avisar('Catálogo', e instanceof Error ? e.message : 'No se pudo subir el catálogo.');
    } finally {
      setSubiendoCatalogo(false);
    }
  };

  const cambiarEstadoPedidoCalle = async (pedido: PedidoCalle, estado: PedidoCalle['estado']) => {
    try {
      await actualizarEstadoPedidoCalle(pedido.id, estado);
      avisar('Pedido calle', `Pedido ${estado}.`, 'ok');
    } catch (e) {
      avisar('Pedido calle', e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    }
  };

  const guardarPedido = async () => {
    const calles = callesRaw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (!titulo.trim()) {
      avisar('Pedido', 'Definí un título para el pedido.');
      return;
    }
    if (calles.length === 0) {
      avisar('Pedido', 'Ingresá al menos una calle.');
      return;
    }
    if (items.length === 0) {
      avisar('Pedido', 'Agregá al menos un producto.');
      return;
    }
    const repartidorSeleccionado = repartidores.find((r) => r.id === repartidorId);
    if (!editingId && !repartidorSeleccionado) {
      avisar('Pedido', 'Seleccioná un repartidor antes de crear y enviar el pedido.');
      return;
    }

    try {
      setGuardando(true);
      setFeedback(null);
      const op =
        editingId != null
          ? Promise.allSettled([
              editarPedidoAdmin(editingId, {
                titulo: titulo.trim(),
                calles,
                items,
                total,
                notas: notas.trim() || undefined,
              }),
            ])
          : Promise.allSettled(
              calles.map((calle) =>
                crearPedidoAdmin({
                  titulo: titulo.trim(),
                  calles: [calle],
                  repartidorId: repartidorSeleccionado?.id ?? REPARTIDOR_SIN_ASIGNAR_ID,
                  repartidorNombre:
                    repartidorSeleccionado?.nombre ?? REPARTIDOR_SIN_ASIGNAR_NOMBRE,
                  items,
                  total,
                  notas: notas.trim() || undefined,
                  estado: repartidorSeleccionado ? 'asignado' : 'pendiente',
                  creadoPorId: usuario?.id,
                  creadoPorNombre: usuario?.nombre,
                })
              )
            );
      const resultados = await op;
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
        setEditingId(null);
      }
      if (fallidos === 0) {
        avisar(
          'Listo',
          editingId
            ? 'Pedido actualizado correctamente.'
            : `Se crearon y asignaron ${creados} pedidos a ${repartidorSeleccionado?.nombre}.`,
          'ok'
        );
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

  const enviarPendientes = async () => {
    const repartidor = repartidores.find((r) => r.id === repartidorId);
    if (!repartidor) {
      avisar('Envío', 'Seleccioná un repartidor para enviar los pedidos.');
      return;
    }
    if (listaPendientes.length === 0) {
      setFeedback({ tipo: 'ok', msg: 'No hay pedidos pendientes para enviar. Los pedidos nuevos ya se crean asignados.' });
      return;
    }
    setGuardando(true);
    try {
      const resultados = await Promise.allSettled(
        listaPendientes.map((p) => asignarPedidoAdmin(p.id, repartidor.id, repartidor.nombre))
      );
      const ok = resultados.filter((x) => x.status === 'fulfilled').length;
      const fail = resultados.length - ok;
      if (fail === 0) {
        avisar('Listo', `Se enviaron ${ok} pedidos a ${repartidor.nombre}.`, 'ok');
      } else {
        avisar('Envío parcial', `Se enviaron ${ok} y fallaron ${fail}.`);
      }
    } finally {
      setGuardando(false);
    }
  };

  const iniciarEdicion = (pedido: PedidoAdmin) => {
    setEditingId(pedido.id);
    setTitulo(pedido.titulo);
    setCallesRaw(pedido.calles.join(', '));
    setItems(pedido.items);
    setNotas(pedido.notas ?? '');
    setDescripcion('');
    setPrecio('');
    setCantidad('1');
  };

  const borrarPedido = async (pedidoId: string) => {
    try {
      await eliminarPedidoAdmin(pedidoId);
      if (editingId === pedidoId) {
        setEditingId(null);
        setTitulo('');
        setCallesRaw('');
        setItems([]);
        setNotas('');
      }
      avisar('Listo', 'Pedido eliminado.', 'ok');
    } catch (e) {
      avisar('Eliminar', e instanceof Error ? e.message : 'No se pudo eliminar.');
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
        <Text style={styles.label}>Catálogo central de productos (Excel)</Text>
        <Button
          label={subiendoCatalogo ? 'SUBIENDO CATÁLOGO…' : 'IMPORTAR EXCEL Y PUBLICAR CATÁLOGO'}
          loading={subiendoCatalogo}
          onPress={() => void importarYSubirCatalogo()}
          variant="secondary"
        />
        <Text style={styles.row}>
          Archivo: {catalogoMeta?.nombreArchivo ?? 'Sin catálogo publicado'} · Actualizado:{' '}
          {catalogoMeta?.updatedAt ? new Date(catalogoMeta.updatedAt).toLocaleString('es-AR') : '—'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pedidos de calle (en preparación)</Text>
        {pedidosCalleActivos.length === 0 ? (
          <Text style={styles.empty}>No hay pedidos de calle activos.</Text>
        ) : (
          pedidosCalleActivos.map((p) => (
            <View key={p.id} style={styles.cardMini}>
              <Text style={styles.title}>
                {p.repartidorNombre} · {p.calleMostrada}
              </Text>
              <Text style={styles.row}>
                Estado: {p.estado} · Total ${p.total.toFixed(2)}
              </Text>
              <View style={styles.actions}>
                <Button
                  label="VISTO"
                  variant="secondary"
                  onPress={() => void cambiarEstadoPedidoCalle(p, 'visto')}
                />
                <Button
                  label="ARMADO"
                  variant="primary"
                  onPress={() => void cambiarEstadoPedidoCalle(p, 'armado')}
                />
                <Button
                  label="CANCELAR"
                  variant="danger"
                  onPress={() => void cambiarEstadoPedidoCalle(p, 'cancelado')}
                />
              </View>
            </View>
          ))
        )}
      </View>

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
          label={guardando ? 'GUARDANDO…' : editingId ? 'ACTUALIZAR PEDIDO' : 'CREAR Y ASIGNAR PEDIDO'}
          loading={guardando}
          onPress={() => void guardarPedido()}
        />
        {editingId ? (
          <Button
            label="CANCELAR EDICIÓN"
            variant="secondary"
            onPress={() => {
              setEditingId(null);
              setTitulo('');
              setCallesRaw('');
              setItems([]);
              setNotas('');
            }}
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Enviar todos los pendientes a repartidor</Text>
        <View style={styles.actions}>
          {repartidores.map((r) => (
            <Button
              key={`env-${r.id}`}
              label={r.nombre}
              variant={repartidorId === r.id ? 'primary' : 'secondary'}
              onPress={() => setRepartidorId(r.id)}
            />
          ))}
        </View>
        <Button
          label={guardando ? 'ENVIANDO…' : 'ENVIAR PENDIENTES AL REPARTIDOR'}
          loading={guardando}
          onPress={() => void enviarPendientes()}
        />
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 24 }}>
        {listaActivos.length === 0 ? (
          <Text style={styles.empty}>No hay pedidos activos. Podés cargar un nuevo lote.</Text>
        ) : (
          listaActivos.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.title}>
                {item.titulo} · {fmtFecha(item.creadoEn)}
              </Text>
              <Text style={styles.row}>Estado: {item.estado} · Total ${item.total.toFixed(2)}</Text>
              <Text style={styles.row}>Calles: {item.calles.join(', ')}</Text>
              {item.items.map((l, i) => (
                <Text key={`${item.id}-l-${i}`} style={styles.itemLine}>
                  {l.cantidad} × {l.descripcion} (${l.subtotal.toFixed(2)})
                </Text>
              ))}
              {item.notas ? <Text style={styles.notas}>Nota: {item.notas}</Text> : null}
              <View style={styles.actions}>
                <Button label="Editar" variant="secondary" onPress={() => iniciarEdicion(item)} />
                <Button label="Eliminar" variant="danger" onPress={() => void borrarPedido(item.id)} />
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  cardMini: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginTop: 8,
  },
  title: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto },
  row: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginTop: 4 },
  total: { fontFamily: 'Poppins_700Bold', color: COLORS.verdeOscuro, marginTop: 8 },
  itemLine: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginTop: 2 },
  notas: { fontFamily: 'Poppins_600SemiBold', color: COLORS.verdeOscuro, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionsWrap: { marginTop: 8 },
});
