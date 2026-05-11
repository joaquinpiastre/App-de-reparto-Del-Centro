import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import {
  actualizarClienteAdmin,
  crearClienteAdmin,
  eliminarClienteAdmin,
  listarClientesAdmin,
  type ClienteAdminCatalogo,
  type TipoCatalogoCliente,
} from '@/services/adminClientes';

type Props = {
  title: string;
  subtitle: string;
  /** Si es false, no se muestra eliminar (p. ej. repartidor). */
  puedeEliminar: boolean;
  showBack?: boolean;
};

type FiltroLista = 'todos' | 'cliente' | 'taller';

export function ClientesCatalogo({ title, subtitle, puedeEliminar, showBack }: Props) {
  const [q, setQ] = useState('');
  const [filtroLista, setFiltroLista] = useState<FiltroLista>('todos');
  const [clientes, setClientes] = useState<ClienteAdminCatalogo[]>([]);
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tipoForm, setTipoForm] = useState<TipoCatalogoCliente>('cliente');
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pedido, setPedido] = useState('');

  const cargar = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await listarClientesAdmin();
      setClientes(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const data = useMemo(() => {
    let list = clientes;
    if (filtroLista === 'cliente') list = list.filter((c) => c.tipo !== 'taller');
    if (filtroLista === 'taller') list = list.filter((c) => c.tipo === 'taller');
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (c) =>
        c.nombre.toLowerCase().includes(s) ||
        c.direccion.toLowerCase().includes(s) ||
        c.telefono.includes(s)
    );
  }, [q, clientes, filtroLista]);

  const resetForm = () => {
    setEditingId(null);
    setTipoForm('cliente');
    setNombre('');
    setDireccion('');
    setTelefono('');
    setPedido('');
    setShowForm(false);
  };

  const guardarCliente = async () => {
    const payload = {
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      telefono: telefono.trim(),
      pedido: pedido.trim(),
      tipo: tipoForm,
    };
    if (!payload.nombre || !payload.direccion || !payload.telefono || !payload.pedido) {
      setError('Completá todos los campos obligatorios.');
      return;
    }
    try {
      setGuardando(true);
      setError(null);
      setOk(null);
      if (editingId) {
        await actualizarClienteAdmin(editingId, payload);
        setOk(payload.tipo === 'taller' ? 'Taller actualizado correctamente.' : 'Cliente actualizado correctamente.');
      } else {
        await crearClienteAdmin(payload);
        setOk(payload.tipo === 'taller' ? 'Taller agregado correctamente.' : 'Cliente agregado correctamente.');
      }
      resetForm();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = (item: ClienteAdminCatalogo) => {
    const etiqueta = item.tipo === 'taller' ? 'este taller' : 'este cliente';
    Alert.alert('Eliminar', `¿Eliminar ${etiqueta}: ${item.nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setGuardando(true);
              setError(null);
              await eliminarClienteAdmin(item.id);
              setOk('Eliminado del catálogo.');
              await cargar();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No se pudo eliminar.');
            } finally {
              setGuardando(false);
            }
          })();
        },
      },
    ]);
  };

  const esTaller = tipoForm === 'taller';
  const tituloForm =
    editingId != null
      ? esTaller
        ? 'Editar taller'
        : 'Editar cliente'
      : esTaller
        ? 'Nuevo taller'
        : 'Nuevo cliente';

  return (
    <Screen title={title} subtitle={subtitle} showBack={showBack}>
      {error ? (
        <View style={[styles.feedback, styles.feedbackError]}>
          <Text style={styles.feedbackText}>{error}</Text>
        </View>
      ) : null}
      {ok ? (
        <View style={[styles.feedback, styles.feedbackOk]}>
          <Text style={styles.feedbackText}>{ok}</Text>
        </View>
      ) : null}

      <Text style={styles.filtroLabel}>Ver listado</Text>
      <View style={styles.filtrosRow}>
        {(['todos', 'cliente', 'taller'] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setFiltroLista(key)}
            style={[styles.filtroChip, filtroLista === key && styles.filtroChipOn]}
          >
            <Text style={[styles.filtroChipTxt, filtroLista === key && styles.filtroChipTxtOn]}>
              {key === 'todos'
                ? `Todos (${clientes.length})`
                : key === 'cliente'
                  ? `Clientes (${clientes.filter((c) => c.tipo !== 'taller').length})`
                  : `Talleres (${clientes.filter((c) => c.tipo === 'taller').length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Buscar por nombre, dirección o teléfono"
        placeholderTextColor={COLORS.grisSecundario}
        value={q}
        onChangeText={setQ}
      />
      {showForm ? (
        <View style={styles.card}>
          <Text style={styles.formTitle}>{tituloForm}</Text>
          <Text style={styles.subLabel}>Tipo de entrada</Text>
          <View style={styles.tipoRow}>
            <Pressable
              onPress={() => setTipoForm('cliente')}
              style={[styles.tipoChip, tipoForm === 'cliente' && styles.tipoChipOn]}
            >
              <Text style={[styles.tipoChipTxt, tipoForm === 'cliente' && styles.tipoChipTxtOn]}>
                Cliente
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTipoForm('taller')}
              style={[styles.tipoChip, tipoForm === 'taller' && styles.tipoChipOn]}
            >
              <Text style={[styles.tipoChipTxt, tipoForm === 'taller' && styles.tipoChipTxtOn]}>
                Taller
              </Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            placeholder={esTaller ? 'Nombre del taller' : 'Nombre o razón social'}
            placeholderTextColor={COLORS.grisSecundario}
            value={nombre}
            onChangeText={setNombre}
          />
          <TextInput
            style={styles.input}
            placeholder="Dirección"
            placeholderTextColor={COLORS.grisSecundario}
            value={direccion}
            onChangeText={setDireccion}
          />
          <TextInput
            style={styles.input}
            placeholder="Teléfono"
            placeholderTextColor={COLORS.grisSecundario}
            value={telefono}
            onChangeText={setTelefono}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder={
              esTaller ? 'Rubro / trabajo o pedido típico' : 'Pedido o referencia típica'
            }
            placeholderTextColor={COLORS.grisSecundario}
            value={pedido}
            onChangeText={setPedido}
          />
          <View style={styles.actions}>
            <Button
              label={
                guardando
                  ? 'GUARDANDO…'
                  : editingId
                    ? 'GUARDAR CAMBIOS'
                    : esTaller
                      ? 'GUARDAR TALLER'
                      : 'GUARDAR CLIENTE'
              }
              loading={guardando}
              onPress={() => void guardarCliente()}
            />
            <Button label="CANCELAR" variant="secondary" onPress={resetForm} />
          </View>
        </View>
      ) : null}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Cargando…' : 'Sin resultados.'}</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowTitulo}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.nombre}
              </Text>
              <View style={[styles.badge, item.tipo === 'taller' ? styles.badgeTaller : styles.badgeCliente]}>
                <Text style={styles.badgeTxt}>{item.tipo === 'taller' ? 'Taller' : 'Cliente'}</Text>
              </View>
            </View>
            <Text style={styles.row}>
              {item.direccion} · {item.telefono}
            </Text>
            <Text style={styles.row}>
              {item.tipo === 'taller' ? 'Rubro / ref.: ' : 'Pedido típico: '}
              {item.pedido}
            </Text>
            <View style={styles.actions}>
              <Button
                label="Editar"
                variant="secondary"
                onPress={() => {
                  setEditingId(item.id);
                  setTipoForm(item.tipo === 'taller' ? 'taller' : 'cliente');
                  setNombre(item.nombre);
                  setDireccion(item.direccion);
                  setTelefono(item.telefono);
                  setPedido(item.pedido);
                  setShowForm(true);
                }}
              />
              {puedeEliminar ? (
                <Button label="Eliminar" variant="danger" onPress={() => confirmarEliminar(item)} />
              ) : null}
            </View>
          </View>
        )}
      />
      <Button
        label={showForm ? 'OCULTAR FORMULARIO' : 'AGREGAR CLIENTE O TALLER'}
        onPress={() => setShowForm((v) => !v)}
        variant="secondary"
      />
      <Button
        label={loading ? 'ACTUALIZANDO…' : 'ACTUALIZAR LISTA'}
        onPress={() => void cargar()}
        variant="secondary"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { borderRadius: 12, padding: 10, borderWidth: 1, marginBottom: 8 },
  feedbackOk: { backgroundColor: '#ecfdf3', borderColor: '#52c47a' },
  feedbackError: { backgroundColor: '#fff3f3', borderColor: '#e06a6a' },
  feedbackText: { fontFamily: 'Poppins_400Regular', color: COLORS.grisTexto },
  filtroLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    color: COLORS.grisTexto,
    marginBottom: 8,
  },
  filtrosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filtroChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8d4cc',
    backgroundColor: '#fff',
  },
  filtroChipOn: { borderColor: COLORS.verdeOscuro, backgroundColor: '#ecfdf3' },
  filtroChipTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: COLORS.grisTexto },
  filtroChipTxtOn: { color: COLORS.verdeOscuro },
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
    fontFamily: 'Poppins_400Regular',
    marginBottom: 8,
    fontSize: 16,
    minHeight: 48,
  },
  empty: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisSecundario, marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8 },
  formTitle: { fontFamily: 'Poppins_700Bold', marginBottom: 10, fontSize: 18 },
  subLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    color: COLORS.grisTexto,
    marginBottom: 8,
  },
  tipoRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tipoChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8d4cc',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tipoChipOn: { borderColor: COLORS.verdeOscuro, backgroundColor: '#ecfdf3' },
  tipoChipTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: COLORS.grisTexto },
  tipoChipTxtOn: { color: COLORS.verdeOscuro },
  rowTitulo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16, flex: 1 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeCliente: { backgroundColor: '#e8f4ea' },
  badgeTaller: { backgroundColor: '#e3f2fd' },
  badgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: COLORS.grisTexto },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
