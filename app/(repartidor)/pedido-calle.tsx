import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { direccionesMismaCalle, normalizarCalle } from '@/lib/direccion';
import { obtenerCatalogoProductos } from '@/services/catalogoProductos';
import { actualizarEstadoPedidoCalle, publicarPedidoCalle, suscribirPedidosCalle } from '@/services/pedidosCalle';
import { listarClientesAdmin, type ClienteAdminCatalogo } from '@/services/adminClientes';
import { useAppStore } from '@/store/useAppStore';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import type { LineaPedidoCalle, ProductoLista } from '@/types';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function fmtMoney(value: unknown): string {
  return toNumber(value).toFixed(2);
}

export default function PedidoCalleScreen() {
  const usuario = useAppStore((s) => s.usuario);
  const clientesDelDia = useAppStore((s) => s.clientesDelDia);
  const jornadaActiva = useAppStore((s) => s.jornadaActiva);
  const pedidosCalle = usePedidosCalleStore((s) => s.pedidos);

  const [calleRef, setCalleRef] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaPedidoCalle[]>([]);
  const [enviando, setEnviando] = useState(false);

  const [descManual, setDescManual] = useState('');
  const [precioManual, setPrecioManual] = useState('');
  const [cantidadManual, setCantidadManual] = useState('1');
  const [codigoSeleccionado, setCodigoSeleccionado] = useState<string | undefined>();
  const [catalogo, setCatalogo] = useState<ProductoLista[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  const [clientes, setClientes] = useState<ClienteAdminCatalogo[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteAdminCatalogo | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [mostrarSugerenciasCliente, setMostrarSugerenciasCliente] = useState(false);

  const misPedidos = useMemo(() => {
    if (!usuario?.id) return [];
    return pedidosCalle
      .filter((p) => p.repartidorId === usuario.id)
      .sort((a, b) => b.creadoEn - a.creadoEn)
      .slice(0, 10);
  }, [pedidosCalle, usuario?.id]);

  useEffect(() => {
    return suscribirPedidosCalle(() => {});
  }, []);

  useEffect(() => {
    void obtenerCatalogoProductos().then((cat) => {
      if (cat?.productos) setCatalogo(cat.productos);
    });
  }, []);

  useEffect(() => {
    void listarClientesAdmin().then(setClientes).catch(() => {});
  }, []);

  const sugerencias = useMemo(() => {
    const q = descManual.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalogo.filter((p) => p.descripcion.toLowerCase().includes(q));
  }, [catalogo, descManual]);

  const sugerenciasCliente = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (q.length < 2) return [];
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || c.direccion.toLowerCase().includes(q)
    );
  }, [clientes, busquedaCliente]);

  const seleccionarCliente = (c: ClienteAdminCatalogo) => {
    setClienteSeleccionado(c);
    setBusquedaCliente('');
    setMostrarSugerenciasCliente(false);
    if (!calleRef.trim()) {
      setCalleRef(c.direccion);
    }
  };

  const limpiarCliente = () => {
    setClienteSeleccionado(null);
    setBusquedaCliente('');
  };

  const clientesMismaCalle = useMemo(() => {
    if (!calleRef.trim()) return [];
    return clientesDelDia
      .filter((c) => direccionesMismaCalle(c.direccion, calleRef))
      .map((c) => ({ nombre: c.nombre, direccion: c.direccion }));
  }, [clientesDelDia, calleRef]);

  const total = useMemo(
    () => lineas.reduce((acc, l) => acc + toNumber(l.subtotal), 0),
    [lineas]
  );

  const seleccionarProducto = (p: ProductoLista) => {
    setDescManual(p.descripcion);
    setPrecioManual(String(p.precioUnitario));
    setCodigoSeleccionado(p.codigo);
    setMostrarSugerencias(false);
  };

  const agregarLineaManual = () => {
    const descripcion = descManual.trim();
    const precio = Number(precioManual.replace(',', '.'));
    const cantidad = Math.max(1, parseInt(cantidadManual, 10) || 1);
    if (!descripcion) {
      Alert.alert('Producto', 'Escribí qué producto es.');
      return;
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      Alert.alert('Precio', 'Ingresá un precio unitario válido (solo lo ves vos en este paso).');
      return;
    }
    const subtotal = Math.round(precio * cantidad * 100) / 100;
    setLineas((prev) => [
      ...prev,
      {
        codigo: codigoSeleccionado,
        descripcion,
        cantidad,
        precioUnitario: precio,
        subtotal,
      },
    ]);
    setDescManual('');
    setPrecioManual('');
    setCantidadManual('1');
    setCodigoSeleccionado(undefined);
  };

  const quitarLinea = (index: number) => {
    setLineas((prev) => prev.filter((_, i) => i !== index));
  };

  const enviarPedido = async () => {
    if (!usuario) {
      Alert.alert('Sesión', 'Volvé a iniciar sesión.');
      return;
    }
    if (!calleRef.trim()) {
      Alert.alert('Calle', 'Indicá la calle de referencia (ej. la que estás recorriendo).');
      return;
    }
    if (lineas.length === 0) {
      Alert.alert('Pedido', 'Agregá al menos una línea con producto y precio.');
      return;
    }
    try {
      setEnviando(true);
      const calleMostrada = calleRef.trim();
      await publicarPedidoCalle({
        calleNormalizada: normalizarCalle(calleMostrada),
        calleMostrada,
        repartidorId: usuario.id,
        repartidorNombre: usuario.nombre,
        items: lineas,
        total,
        notas: notas.trim() || undefined,
        clientesMismaCalle,
        estado: 'pendiente',
        clienteId: clienteSeleccionado?.id,
        clienteNombre: clienteSeleccionado?.nombre,
      });
      setLineas([]);
      setNotas('');
      setClienteSeleccionado(null);
      Alert.alert(
        'Pedido enviado',
        'El equipo en el local recibió el pedido (notificación en la app admin si está abierta).'
      );
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'No se pudo publicar el pedido.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen
      title="Pedido en la calle"
      subtitle="Buscá productos del catálogo o cargá manualmente"
      showBack
      scrollable
    >
      <View>
        <Text style={styles.help}>
          Buscá el producto por nombre y el precio se completa solo desde el catálogo. Si no lo encontrás, escribilo manualmente.
        </Text>

        <Text style={styles.label}>Cliente / Taller</Text>
        <Text style={styles.hint}>Seleccioná a quién le levantás el pedido</Text>
        {clienteSeleccionado ? (
          <View style={styles.clienteChip}>
            <View style={styles.clienteChipInfo}>
              <Text style={styles.clienteChipNombre}>{clienteSeleccionado.nombre}</Text>
              <Text style={styles.clienteChipDireccion}>{clienteSeleccionado.direccion}</Text>
              <View style={styles.clienteTipoBadge}>
                <Text style={styles.clienteTipoBadgeText}>
                  {clienteSeleccionado.tipo === 'taller' ? 'Taller' : 'Cliente'}
                </Text>
              </View>
            </View>
            <Pressable onPress={limpiarCliente} style={styles.clienteChipClear} hitSlop={12}>
              <Text style={styles.clienteChipClearText}>Cambiar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Buscá por nombre o dirección…"
              placeholderTextColor={COLORS.grisSecundario}
              value={busquedaCliente}
              onChangeText={(t) => {
                setBusquedaCliente(t);
                setMostrarSugerenciasCliente(true);
              }}
            />
            {mostrarSugerenciasCliente && sugerenciasCliente.length > 0 && (
              <View style={styles.sugerenciasBox}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={styles.sugerenciasScroll}
                  showsVerticalScrollIndicator
                >
                  {sugerenciasCliente.map((c) => (
                    <Pressable
                      key={c.id}
                      style={({ pressed }) => [styles.sugerenciaItem, pressed && styles.sugerenciaPressed]}
                      onPress={() => seleccionarCliente(c)}
                    >
                      <View style={styles.clienteSugerenciaInfo}>
                        <Text style={styles.sugerenciaNombre} numberOfLines={1}>{c.nombre}</Text>
                        <Text style={styles.clienteSugerenciaDireccion} numberOfLines={1}>{c.direccion}</Text>
                      </View>
                      <Text style={styles.clienteSugerenciaTipo}>
                        {c.tipo === 'taller' ? 'Taller' : 'Cliente'}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        <Text style={styles.label}>Calle de referencia</Text>
        <Text style={styles.hint}>Para agrupar con tu ruta actual</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Av. San Martín 1200"
          placeholderTextColor={COLORS.grisSecundario}
          value={calleRef}
          onChangeText={setCalleRef}
        />
        {jornadaActiva && clientesMismaCalle.length > 0 ? (
          <View style={styles.calleBox}>
            <Text style={styles.calleTitle}>Clientes de tu ruta en esa calle</Text>
            {clientesMismaCalle.map((c) => (
              <Text key={c.direccion + c.nombre} style={styles.calleRow}>
                · {c.nombre} — {c.direccion}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.cardDestacada}>
          <Text style={styles.sectionTitle}>Nueva línea del pedido</Text>

          <Text style={styles.label}>Producto</Text>
          <TextInput
            style={styles.input}
            placeholder="Buscá por nombre del producto…"
            placeholderTextColor={COLORS.grisSecundario}
            value={descManual}
            onChangeText={(t) => {
              setDescManual(t);
              setCodigoSeleccionado(undefined);
              setMostrarSugerencias(true);
            }}
          />
          {mostrarSugerencias && sugerencias.length > 0 && (
            <View style={styles.sugerenciasBox}>
              <Text style={styles.sugerenciasConteo}>
                {sugerencias.length} resultado{sugerencias.length !== 1 ? 's' : ''}
              </Text>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={styles.sugerenciasScroll}
                showsVerticalScrollIndicator
              >
                {sugerencias.map((p) => (
                  <Pressable
                    key={p.codigo}
                    style={({ pressed }) => [styles.sugerenciaItem, pressed && styles.sugerenciaPressed]}
                    onPress={() => seleccionarProducto(p)}
                  >
                    <Text style={styles.sugerenciaNombre} numberOfLines={2}>{p.descripcion}</Text>
                    <Text style={styles.sugerenciaPrecio}>${fmtMoney(p.precioUnitario)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Text style={styles.label}>Precio unitario</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 1250 o 1250,50"
            placeholderTextColor={COLORS.grisSecundario}
            value={precioManual}
            onChangeText={setPrecioManual}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Cantidad</Text>
          <TextInput
            style={styles.input}
            placeholder="1"
            placeholderTextColor={COLORS.grisSecundario}
            value={cantidadManual}
            onChangeText={setCantidadManual}
            keyboardType="number-pad"
          />

          <Button label="AGREGAR AL PEDIDO" onPress={agregarLineaManual} variant="secondary" />
        </View>

        <Text style={styles.label}>Ítems del pedido</Text>
        {lineas.length === 0 ? (
          <Text style={styles.meta}>Todavía no agregaste líneas.</Text>
        ) : (
          lineas.map((l, i) => (
            <View key={`${l.descripcion}-${i}`} style={styles.lineaCard}>
              <View style={styles.lineaHeader}>
                <Text style={styles.lineaTit} numberOfLines={3}>
                  {l.cantidad} × {l.descripcion}
                </Text>
                <Pressable
                  onPress={() => quitarLinea(i)}
                  style={styles.quitarBtn}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar línea"
                >
                  <Text style={styles.quitarTxt}>Quitar</Text>
                </Pressable>
              </View>
              <Text style={styles.lineaPrecio}>
                Unit. ${fmtMoney(l.precioUnitario)} · Subtotal ${fmtMoney(l.subtotal)}
              </Text>
            </View>
          ))
        )}
        <Text style={styles.total}>Total estimado: ${fmtMoney(total)}</Text>

        <Text style={styles.label}>Notas para el local (opcional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Ej: dejar en depósito / factura a nombre de…"
          placeholderTextColor={COLORS.grisSecundario}
          value={notas}
          onChangeText={setNotas}
          multiline
        />

        <Button
          label={enviando ? 'ENVIANDO…' : 'ENVIAR PEDIDO AL LOCAL'}
          loading={enviando}
          onPress={() => void enviarPedido()}
        />

        <Text style={[styles.label, styles.sep]}>Mis pedidos al local</Text>
        {misPedidos.length === 0 ? (
          <Text style={styles.meta}>Todavía no enviaste pedidos.</Text>
        ) : (
          misPedidos.map((p) => (
            <View key={p.id} style={styles.pedidoCard}>
              {p.clienteNombre ? (
                <View style={styles.pedidoClienteTag}>
                  <Text style={styles.pedidoClienteTagText}>{p.clienteNombre}</Text>
                </View>
              ) : null}
              <Text style={styles.pedidoTit}>
                {p.calleMostrada} · ${fmtMoney(p.total)}
              </Text>
              <Text style={styles.pedidoEstado}>Estado: {p.estado}</Text>
              {p.items?.length ? (
                <View style={styles.pedidoItems}>
                  {p.items.map((it, idx) => (
                    <Text key={`${p.id}-it-${idx}`} style={styles.pedidoItemRow}>
                      {it.cantidad} × {it.descripcion} — ${fmtMoney(it.subtotal)}
                    </Text>
                  ))}
                </View>
              ) : null}
              {p.estado === 'armado' ? (
                <View style={styles.retiradoWrap}>
                  <Button
                    label="MARCAR RETIRADO"
                    onPress={() => void actualizarEstadoPedidoCalle(p.id, 'retirado')}
                  />
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  help: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisTexto,
    marginBottom: 6,
    fontSize: 15,
    lineHeight: 22,
  },
  hint: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisSecundario,
    fontSize: 13,
    marginBottom: 6,
    marginTop: -4,
  },
  meta: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginVertical: 8, fontSize: 15 },
  label: {
    fontFamily: 'Poppins_700Bold',
    color: COLORS.grisTexto,
    marginTop: 14,
    marginBottom: 6,
    fontSize: 16,
  },
  sep: { marginTop: 22 },
  input: {
    borderWidth: 1,
    borderColor: '#c8c8c8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    minHeight: 52,
    fontFamily: 'Poppins_400Regular',
    backgroundColor: '#fff',
    fontSize: 16,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 },
  calleBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.verdePrincipal,
  },
  calleTitle: { fontFamily: 'Poppins_700Bold', color: COLORS.verdeOscuro, fontSize: 16, marginBottom: 6 },
  calleRow: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, fontSize: 15, lineHeight: 22 },

  cardDestacada: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#dfe6dc',
    gap: 0,
  },
  sectionTitle: {
    fontFamily: 'Poppins_800ExtraBold',
    fontSize: 18,
    color: COLORS.verdeOscuro,
    marginBottom: 8,
  },
  privacyNote: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisSecundario,
    lineHeight: 20,
    marginBottom: 8,
  },

  lineaCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  lineaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  lineaTit: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisTexto,
    fontSize: 16,
    flex: 1,
    lineHeight: 22,
  },
  quitarBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  quitarTxt: { fontFamily: 'Poppins_600SemiBold', color: '#c43c3c', fontSize: 15 },
  lineaPrecio: {
    fontFamily: 'Poppins_500Medium',
    color: COLORS.grisSecundario,
    fontSize: 15,
    marginTop: 8,
  },
  total: {
    fontFamily: 'Poppins_800ExtraBold',
    fontSize: 22,
    color: COLORS.verdeOscuro,
    marginTop: 14,
    marginBottom: 6,
  },

  pedidoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dde3e8',
  },
  pedidoClienteTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  pedidoClienteTagText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.verdeOscuro,
  },
  pedidoTit: { fontFamily: 'Poppins_700Bold', color: COLORS.verdeOscuro, fontSize: 17 },
  pedidoEstado: { fontFamily: 'Poppins_500Medium', color: COLORS.grisTexto, fontSize: 15, marginTop: 6 },
  pedidoItems: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  pedidoItemRow: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisTexto,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  retiradoWrap: { marginTop: 12 },

  sugerenciasBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.verdePrincipal,
    borderRadius: 12,
    marginTop: 4,
  },
  sugerenciasConteo: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    color: COLORS.grisSecundario,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sugerenciasScroll: {
    maxHeight: 280,
  },
  sugerenciaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 8,
  },
  sugerenciaPressed: {
    backgroundColor: '#f5faf2',
  },
  sugerenciaNombre: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
    color: COLORS.grisTexto,
    flex: 1,
    lineHeight: 20,
  },
  sugerenciaPrecio: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 15,
    color: COLORS.verdeOscuro,
  },
  clienteChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#f0f9f2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.verdePrincipal,
    padding: 14,
    gap: 12,
  },
  clienteChipInfo: { flex: 1, gap: 4 },
  clienteChipNombre: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: COLORS.verdeOscuro,
  },
  clienteChipDireccion: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisTexto,
  },
  clienteTipoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#d4edda',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  clienteTipoBadgeText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.verdeOscuro,
  },
  clienteChipClear: { paddingVertical: 4 },
  clienteChipClearText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    color: COLORS.verdePrincipal,
  },
  clienteSugerenciaInfo: { flex: 1, gap: 2 },
  clienteSugerenciaDireccion: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisSecundario,
  },
  clienteSugerenciaTipo: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.verdePrincipal,
  },
});
