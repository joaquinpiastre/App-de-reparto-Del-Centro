import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { direccionesMismaCalle, normalizarCalle } from '@/lib/direccion';
import { parseListaPreciosDesdeUri } from '@/services/listaPreciosExcel';
import { obtenerCatalogoProductos } from '@/services/catalogoProductos';
import { actualizarEstadoPedidoCalle, publicarPedidoCalle, suscribirPedidosCalle } from '@/services/pedidosCalle';
import { useAppStore } from '@/store/useAppStore';
import { useListaPreciosStore } from '@/store/useListaPreciosStore';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import type { LineaPedidoCalle, ProductoLista } from '@/types';

export default function PedidoCalleScreen() {
  const usuario = useAppStore((s) => s.usuario);
  const clientesDelDia = useAppStore((s) => s.clientesDelDia);
  const jornadaActiva = useAppStore((s) => s.jornadaActiva);

  const productos = useListaPreciosStore((s) => s.productos);
  const ultimoArchivo = useListaPreciosStore((s) => s.ultimoArchivo);
  const setLista = useListaPreciosStore((s) => s.setLista);
  const pedidosCalle = usePedidosCalleStore((s) => s.pedidos);

  const [busqueda, setBusqueda] = useState('');
  const [calleRef, setCalleRef] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaPedidoCalle[]>([]);
  const [importando, setImportando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [syncCatalogo, setSyncCatalogo] = useState(false);

  const misPedidos = useMemo(() => {
    if (!usuario?.id) return [];
    return pedidosCalle
      .filter((p) => p.repartidorId === usuario.id)
      .sort((a, b) => b.creadoEn - a.creadoEn)
      .slice(0, 8);
  }, [pedidosCalle, usuario?.id]);

  useEffect(() => {
    const unsubscribe = suscribirPedidosCalle(() => {});
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (productos.length > 0) return;
    void sincronizarCatalogo();
  }, [productos.length]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos.slice(0, 40);
    return productos
      .filter(
        (p) =>
          p.descripcion.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [productos, busqueda]);

  const clientesMismaCalle = useMemo(() => {
    if (!calleRef.trim()) return [];
    return clientesDelDia
      .filter((c) => direccionesMismaCalle(c.direccion, calleRef))
      .map((c) => ({ nombre: c.nombre, direccion: c.direccion }));
  }, [clientesDelDia, calleRef]);

  const total = useMemo(
    () => lineas.reduce((acc, l) => acc + l.subtotal, 0),
    [lineas]
  );

  const importarExcel = async () => {
    try {
      setImportando(true);
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const asset = res.assets[0];
      const lista = await parseListaPreciosDesdeUri(asset.uri);
      if (lista.length === 0) {
        Alert.alert('Lista vacía', 'No encontramos filas con descripción y precio. Revisá el Excel.');
        return;
      }
      setLista(lista, asset.name ?? 'precios.xlsx');
      Alert.alert('Listo', `Se importaron ${lista.length} productos.`);
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'No se pudo leer el archivo. Probá otro Excel o exportá como .xlsx.');
    } finally {
      setImportando(false);
    }
  };

  const sincronizarCatalogo = async () => {
    try {
      setSyncCatalogo(true);
      const catalogo = await obtenerCatalogoProductos();
      if (!catalogo || catalogo.productos.length === 0) {
        Alert.alert('Catálogo', 'No hay catálogo central disponible todavía.');
        return;
      }
      setLista(catalogo.productos, catalogo.nombreArchivo ?? 'catalogo-central');
      Alert.alert('Catálogo actualizado', `Se sincronizaron ${catalogo.productos.length} productos.`);
    } catch (e) {
      Alert.alert('Catálogo', e instanceof Error ? e.message : 'No se pudo sincronizar el catálogo.');
    } finally {
      setSyncCatalogo(false);
    }
  };

  const agregarProducto = (p: ProductoLista) => {
    const n = Math.max(1, parseInt(cantidad, 10) || 1);
    const precio = p.precioUnitario;
    const subtotal = Math.round(precio * n * 100) / 100;
    setLineas((prev) => [
      ...prev,
      {
        codigo: p.codigo,
        descripcion: p.descripcion,
        cantidad: n,
        precioUnitario: precio,
        subtotal,
      },
    ]);
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
      Alert.alert('Pedido', 'Agregá al menos un producto.');
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
      });
      setLineas([]);
      setNotas('');
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
      subtitle="Lista Excel · misma calle · aviso al local"
    >
      <Text style={styles.help}>
        Importá un Excel con columnas de código, descripción y precio. Buscá productos, armá el
        pedido y enviálo; en administración aparece en «Pedidos calle».
      </Text>

      <Button
        label={importando ? 'IMPORTANDO…' : 'IMPORTAR EXCEL DE PRECIOS'}
        loading={importando}
        onPress={() => void importarExcel()}
        variant="secondary"
      />
      <Button
        label={syncCatalogo ? 'SINCRONIZANDO…' : 'SINCRONIZAR CATÁLOGO CENTRAL'}
        loading={syncCatalogo}
        onPress={() => void sincronizarCatalogo()}
        variant="secondary"
      />
      {ultimoArchivo ? (
        <Text style={styles.meta}>Último archivo: {ultimoArchivo} · {productos.length} ítems</Text>
      ) : (
        <Text style={styles.meta}>Todavía no cargaste precios.</Text>
      )}

      <Text style={styles.label}>Calle de referencia (para agrupar paradas)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Av. San Martín"
        placeholderTextColor={COLORS.grisSecundario}
        value={calleRef}
        onChangeText={setCalleRef}
      />
      {jornadaActiva && clientesMismaCalle.length > 0 ? (
        <View style={styles.calleBox}>
          <Text style={styles.calleTitle}>Clientes de tu ruta en esa calle:</Text>
          {clientesMismaCalle.map((c) => (
            <Text key={c.direccion + c.nombre} style={styles.calleRow}>
              · {c.nombre} — {c.direccion}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>Buscar en lista</Text>
      <TextInput
        style={styles.input}
        placeholder="Nombre o código"
        placeholderTextColor={COLORS.grisSecundario}
        value={busqueda}
        onChangeText={setBusqueda}
      />

      <Text style={styles.label}>Cantidad para agregar</Text>
      <TextInput
        style={styles.input}
        placeholder="1"
        placeholderTextColor={COLORS.grisSecundario}
        value={cantidad}
        onChangeText={setCantidad}
        keyboardType="number-pad"
      />

      <FlatList
        data={filtrados}
        keyExtractor={(item) => item.codigo + item.descripcion}
        style={styles.lista}
        nestedScrollEnabled
        renderItem={({ item }) => (
          <View style={styles.prodRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prodTit}>{item.descripcion}</Text>
              <Text style={styles.prodSub}>
                {item.codigo} · ${item.precioUnitario.toFixed(2)}
              </Text>
            </View>
            <Button label="Agregar" onPress={() => agregarProducto(item)} />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.meta}>Importá un Excel o ajustá la búsqueda.</Text>
        }
      />

      <Text style={styles.label}>Ítems del pedido</Text>
      {lineas.length === 0 ? (
        <Text style={styles.meta}>Todavía no agregaste productos.</Text>
      ) : (
        lineas.map((l, i) => (
          <Text key={`${l.codigo}-${i}`} style={styles.linea}>
            {l.cantidad} × {l.descripcion} — ${l.subtotal.toFixed(2)}
          </Text>
        ))
      )}
      <Text style={styles.total}>Total estimado: ${total.toFixed(2)}</Text>

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
      <Text style={styles.label}>Mis pedidos al local</Text>
      {misPedidos.length === 0 ? (
        <Text style={styles.meta}>Todavía no enviaste pedidos.</Text>
      ) : (
        misPedidos.map((p) => (
          <View key={p.id} style={styles.calleBox}>
            <Text style={styles.calleTitle}>
              {p.calleMostrada} · ${p.total.toFixed(2)}
            </Text>
            <Text style={styles.calleRow}>Estado: {p.estado}</Text>
            {p.estado === 'armado' ? (
              <View style={{ marginTop: 8 }}>
                <Button
                  label="MARCAR RETIRADO"
                  onPress={() => void actualizarEstadoPedidoCalle(p.id, 'retirado')}
                />
              </View>
            ) : null}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  help: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto, marginBottom: 8 },
  meta: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginVertical: 6 },
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
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  calleBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.verdePrincipal,
  },
  calleTitle: { fontFamily: 'Poppins_700Bold', color: COLORS.verdeOscuro },
  calleRow: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto },
  lista: { maxHeight: 220, marginTop: 8 },
  prodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    marginBottom: 6,
  },
  prodTit: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto },
  prodSub: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, fontSize: 12 },
  linea: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto },
  total: { fontFamily: 'Poppins_800ExtraBold', fontSize: 18, color: COLORS.verdeOscuro, marginTop: 8 },
});
