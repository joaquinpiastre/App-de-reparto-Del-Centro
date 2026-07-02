import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { COLORS } from '@/constants/colors';
import { listarClientesAdmin, type ClienteAdminCatalogo } from '@/services/adminClientes';
import { registrarPagoApi, METODO_LABEL, type MetodoPago, type PagoRegistrado } from '@/services/pagosApi';

const METODOS: MetodoPago[] = ['efectivo', 'transferencia', 'cheque', 'otro'];

function generarTextoRecibo(
  pago: PagoRegistrado,
  clienteNombre: string,
  metodo: MetodoPago,
  numeroCheque: string,
  banco: string,
): string {
  const fecha = new Date(pago.creadoEn).toLocaleDateString('es-AR');
  const hora = new Date(pago.creadoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const chequeDetalle = metodo === 'cheque' && (numeroCheque || banco)
    ? `\nCheque: ${[numeroCheque, banco].filter(Boolean).join(' · ')}`
    : '';

  return `*RECIBO – Del Centro Pinturerias*
──────────────────────────────
Cliente: ${clienteNombre}
Monto: $${Number(pago.monto).toFixed(2)}
Forma de pago: ${METODO_LABEL[metodo]}${chequeDetalle}
Fecha: ${fecha} ${hora}
Cobrado por: ${pago.repartidorNombre}
──────────────────────────────`;
}

async function compartir(texto: string) {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text: texto });
    } else {
      await navigator.clipboard.writeText(texto);
      Alert.alert('Copiado', 'El recibo fue copiado al portapapeles.');
    }
  } else {
    await Share.share({ message: texto });
  }
}

export default function CobrosScreen() {
  const [clientes, setClientes] = useState<ClienteAdminCatalogo[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteAdminCatalogo | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [numeroCheque, setNumeroCheque] = useState('');
  const [banco, setBanco] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ultimoPago, setUltimoPago] = useState<PagoRegistrado | null>(null);

  useFocusEffect(
    useCallback(() => {
      setCargandoClientes(true);
      listarClientesAdmin()
        .then(setClientes)
        .catch(() => setClientes([]))
        .finally(() => setCargandoClientes(false));
    }, [])
  );

  const clientesFiltrados = busqueda.length >= 2
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.direccion.toLowerCase().includes(busqueda.toLowerCase())
      )
    : [];

  const registrar = async () => {
    if (!clienteSeleccionado) { Alert.alert('Cobro', 'Seleccioná un cliente.'); return; }
    const montoNum = Number(monto.replace(',', '.'));
    if (!montoNum || montoNum <= 0) { Alert.alert('Cobro', 'Ingresá un monto válido.'); return; }
    if (!metodo) { Alert.alert('Cobro', 'Seleccioná la forma de pago.'); return; }
    if (metodo === 'cheque' && !numeroCheque.trim()) { Alert.alert('Cobro', 'Ingresá el número de cheque.'); return; }
    if (metodo === 'cheque' && !banco.trim()) { Alert.alert('Cobro', 'Ingresá el banco del cheque.'); return; }

    setEnviando(true);
    try {
      const pago = await registrarPagoApi({
        clienteId: clienteSeleccionado.id,
        clienteNombre: clienteSeleccionado.nombre,
        monto: montoNum,
        metodo,
        numeroCheque: metodo === 'cheque' ? numeroCheque.trim() : undefined,
        banco: metodo === 'cheque' ? banco.trim() : undefined,
        observaciones: observaciones.trim() || undefined,
      });
      setUltimoPago(pago);
      // Limpiar formulario
      setMonto('');
      setMetodo(null);
      setNumeroCheque('');
      setBanco('');
      setObservaciones('');
      setClienteSeleccionado(null);
      setBusqueda('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo registrar el cobro.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen title="Registrar cobro" subtitle="Seleccioná el cliente y el monto" scrollable>

      {/* Recibo del último cobro */}
      {ultimoPago ? (
        <View style={styles.reciboCard}>
          <View style={styles.reciboHeader}>
            <MaterialIcons name="check-circle" size={22} color={COLORS.exito} />
            <Text style={styles.reciboTitulo}>Cobro registrado</Text>
          </View>
          <Text style={styles.reciboCliente}>{ultimoPago.clienteNombre}</Text>
          <Text style={styles.reciboMonto}>${Number(ultimoPago.monto).toFixed(2)}</Text>
          <Text style={styles.reciboDetalle}>
            {METODO_LABEL[ultimoPago.metodo]} · {new Date(ultimoPago.creadoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={styles.reciboAcciones}>
            <View style={{ flex: 1 }}>
              <Button
                label="COMPARTIR RECIBO"
                variant="secondary"
                onPress={() =>
                  void compartir(
                    generarTextoRecibo(ultimoPago, ultimoPago.clienteNombre, ultimoPago.metodo, numeroCheque, banco)
                  )
                }
              />
            </View>
            <Pressable style={styles.cerrarBtn} onPress={() => setUltimoPago(null)}>
              <MaterialIcons name="close" size={20} color={COLORS.grisSecundario} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Selector de cliente */}
      <View style={styles.seccion}>
        <Text style={styles.label}>Cliente</Text>
        {clienteSeleccionado ? (
          <View style={styles.clienteSeleccionado}>
            <View style={{ flex: 1 }}>
              <Text style={styles.clienteNombre}>{clienteSeleccionado.nombre}</Text>
              <Text style={styles.clienteDireccion}>{clienteSeleccionado.direccion}</Text>
            </View>
            <Pressable onPress={() => { setClienteSeleccionado(null); setBusqueda(''); }}>
              <MaterialIcons name="close" size={20} color={COLORS.grisSecundario} />
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Buscar cliente por nombre o dirección…"
              placeholderTextColor={COLORS.grisSecundario}
              value={busqueda}
              onChangeText={setBusqueda}
            />
            {cargandoClientes && busqueda.length >= 2 ? (
              <ActivityIndicator color={COLORS.verdePrincipal} style={{ marginTop: 8 }} />
            ) : null}
            {clientesFiltrados.slice(0, 8).map((c) => (
              <Pressable
                key={c.id}
                style={({ pressed }) => [styles.clienteItem, pressed && { opacity: 0.7 }]}
                onPress={() => { setClienteSeleccionado(c); setBusqueda(''); }}
              >
                <Text style={styles.clienteNombre}>{c.nombre}</Text>
                <Text style={styles.clienteDireccion}>{c.direccion}</Text>
              </Pressable>
            ))}
            {busqueda.length >= 2 && clientesFiltrados.length === 0 && !cargandoClientes ? (
              <Text style={styles.sinResultados}>No se encontraron clientes.</Text>
            ) : null}
          </>
        )}
      </View>

      {/* Monto */}
      <View style={styles.seccion}>
        <Text style={styles.label}>Monto cobrado</Text>
        <TextInput
          style={styles.inputGrande}
          placeholder="$0.00"
          placeholderTextColor={COLORS.grisSecundario}
          keyboardType="decimal-pad"
          value={monto}
          onChangeText={setMonto}
        />
      </View>

      {/* Método de pago */}
      <View style={styles.seccion}>
        <Text style={styles.label}>Forma de pago</Text>
        <View style={styles.chips}>
          {METODOS.map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, metodo === m && styles.chipActivo]}
              onPress={() => setMetodo(m)}
            >
              <Text style={[styles.chipTexto, metodo === m && styles.chipTextoActivo]}>
                {METODO_LABEL[m]}
              </Text>
            </Pressable>
          ))}
        </View>

        {metodo === 'cheque' ? (
          <>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Número de cheque"
              placeholderTextColor={COLORS.grisSecundario}
              value={numeroCheque}
              onChangeText={setNumeroCheque}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Banco"
              placeholderTextColor={COLORS.grisSecundario}
              value={banco}
              onChangeText={setBanco}
            />
          </>
        ) : null}
      </View>

      {/* Observaciones */}
      <View style={styles.seccion}>
        <Text style={styles.label}>Observaciones (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultilinea]}
          placeholder="Notas adicionales…"
          placeholderTextColor={COLORS.grisSecundario}
          multiline
          numberOfLines={2}
          value={observaciones}
          onChangeText={setObservaciones}
        />
      </View>

      <Button
        label="REGISTRAR COBRO"
        loading={enviando}
        onPress={() => void registrar()}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  reciboCard: {
    backgroundColor: COLORS.verdeOscuro,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    marginBottom: 4,
  },
  reciboHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reciboTitulo: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: '#fff' },
  reciboCliente: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  reciboMonto: { fontFamily: 'Poppins_800ExtraBold', fontSize: 28, color: '#fff' },
  reciboDetalle: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  reciboAcciones: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  cerrarBtn: { padding: 6 },
  seccion: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e8ecef',
  },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisSecundario },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8ed',
    borderRadius: 10,
    padding: 12,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisTexto,
    backgroundColor: COLORS.grisClaro,
  },
  inputGrande: {
    borderWidth: 1,
    borderColor: '#e2e8ed',
    borderRadius: 12,
    padding: 16,
    fontFamily: 'Poppins_800ExtraBold',
    fontSize: 28,
    color: COLORS.grisTexto,
    backgroundColor: COLORS.grisClaro,
    textAlign: 'center',
  },
  inputMultilinea: { minHeight: 64, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.grisClaro,
    borderWidth: 1,
    borderColor: '#e2e8ed',
  },
  chipActivo: { backgroundColor: COLORS.verdePrincipal, borderColor: COLORS.verdeOscuro },
  chipTexto: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisTexto },
  chipTextoActivo: { color: '#fff' },
  clienteSeleccionado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#e8f5e0',
    borderRadius: 10,
    padding: 12,
  },
  clienteItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.grisClaro,
    gap: 2,
  },
  clienteNombre: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: COLORS.grisTexto },
  clienteDireccion: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  sinResultados: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: COLORS.grisSecundario, textAlign: 'center', padding: 8 },
});
