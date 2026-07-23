import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Print from 'expo-print';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { formatFechaHora } from '@/lib/fechaHora';
import {
  actualizarClienteAdmin,
  crearClienteAdmin,
  eliminarClienteAdmin,
  listarClientesAdmin,
  type CategoriaCliente,
  type ClienteAdminCatalogo,
  type TipoCatalogoCliente,
} from '@/services/adminClientes';

const CATEGORIAS: CategoriaCliente[] = ['A', 'B', 'C', 'D'];

const CAT_LABEL: Record<CategoriaCliente, string> = {
  A: 'A · Lun/Mié',
  B: 'B · Mar/Jue',
  C: 'C · Vie',
  D: 'D · Andrés',
};

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generarHTMLListadoClientes(clientes: ClienteAdminCatalogo[], titulo: string): string {
  const filas = clientes
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${c.tipo === 'taller' ? 'Taller' : 'Cliente'}</td>
        <td>${escapeHtml(c.direccion)}</td>
        <td>${escapeHtml(c.telefono)}</td>
        <td>${escapeHtml(c.pedido)}</td>
        <td>${c.categorias.join(', ') || '—'}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #2a2a2a; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; }
  footer { margin-top: 16px; font-size: 10px; color: #999; }
</style>
</head>
<body>
  <h1>${escapeHtml(titulo)}</h1>
  <div class="sub">${clientes.length} registro(s) · Impreso ${formatFechaHora(Date.now())}</div>
  <table>
    <thead>
      <tr><th>Nombre</th><th>Tipo</th><th>Dirección</th><th>Teléfono</th><th>Pedido / rubro</th><th>Categorías</th></tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  <footer>Del Centro Pinturerías</footer>
</body>
</html>`;
}

async function imprimirListadoClientes(clientes: ClienteAdminCatalogo[], titulo: string) {
  try {
    const html = generarHTMLListadoClientes(clientes, titulo);
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
    Alert.alert('Error', 'No se pudo generar el listado para imprimir.');
  }
}

type Props = {
  title: string;
  subtitle: string;
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
  const [categoriasForm, setCategoriasForm] = useState<CategoriaCliente[]>([]);

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

  const toggleCategoria = (cat: CategoriaCliente) => {
    setCategoriasForm((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setTipoForm('cliente');
    setNombre('');
    setDireccion('');
    setTelefono('');
    setPedido('');
    setCategoriasForm([]);
    setShowForm(false);
  };

  const guardarCliente = async () => {
    const payload = {
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      telefono: telefono.trim(),
      pedido: pedido.trim(),
      tipo: tipoForm,
      categorias: categoriasForm,
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
      ? esTaller ? 'Editar taller' : 'Editar cliente'
      : esTaller ? 'Nuevo taller' : 'Nuevo cliente';

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
      <Button
        label="IMPRIMIR LISTADO (PDF)"
        variant="secondary"
        onPress={() =>
          void imprimirListadoClientes(
            data,
            filtroLista === 'cliente' ? 'Listado de clientes' : filtroLista === 'taller' ? 'Listado de talleres' : 'Listado de clientes y talleres'
          )
        }
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

          <Text style={styles.subLabel}>Días de visita (categoría)</Text>
          <View style={styles.tipoRow}>
            {CATEGORIAS.map((cat) => {
              const activo = categoriasForm.includes(cat);
              return (
                <Pressable
                  key={cat}
                  onPress={() => toggleCategoria(cat)}
                  style={[
                    styles.catChip,
                    activo && { borderColor: CAT_COLOR[cat], backgroundColor: CAT_BG[cat] },
                  ]}
                >
                  <Text style={[styles.catChipTxt, activo && { color: CAT_COLOR[cat] }]}>
                    {CAT_LABEL[cat]}
                  </Text>
                </Pressable>
              );
            })}
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
            placeholder={esTaller ? 'Rubro / trabajo o pedido típico' : 'Pedido o referencia típica'}
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
                    : esTaller ? 'GUARDAR TALLER' : 'GUARDAR CLIENTE'
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
              <View style={styles.badgesRow}>
                <View style={[styles.badge, item.tipo === 'taller' ? styles.badgeTaller : styles.badgeCliente]}>
                  <Text style={styles.badgeTxt}>{item.tipo === 'taller' ? 'Taller' : 'Cliente'}</Text>
                </View>
                {item.categorias.map((cat) => (
                  <View key={cat} style={[styles.badge, { backgroundColor: CAT_BG[cat] }]}>
                    <Text style={[styles.badgeTxt, { color: CAT_COLOR[cat] }]}>{cat}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={styles.row}>
              {item.direccion} · {item.telefono}
            </Text>
            <Text style={styles.row}>
              {item.tipo === 'taller' ? 'Rubro / ref.: ' : 'Pedido típico: '}
              {item.pedido}
            </Text>
            {item.categorias.length > 0 && (
              <Text style={styles.catInfo}>
                Visitas: {item.categorias.map((c) => CAT_LABEL[c]).join(' · ')}
              </Text>
            )}
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
                  setCategoriasForm(item.categorias);
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
  catChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#c8d4cc',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  catChipTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisSecundario },
  rowTitulo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  badgesRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' },
  itemTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16, flex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeCliente: { backgroundColor: '#e8f4ea' },
  badgeTaller: { backgroundColor: '#e3f2fd' },
  badgeTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: COLORS.grisTexto },
  row: { fontFamily: 'Poppins_400Regular', marginTop: 4, fontSize: 15, lineHeight: 22 },
  catInfo: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: COLORS.grisSecundario,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
