import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { API_ENABLED } from '@/constants/api';
import { COLORS } from '@/constants/colors';
import {
  obtenerCatalogoProductos,
  reemplazarCatalogoProductos,
  type CatalogoProductos,
} from '@/services/catalogoProductos';
import { parseListaPreciosDesdeUri } from '@/services/listaPreciosExcel';
import { formatFechaHora } from '@/lib/fechaHora';
import type { ProductoLista } from '@/types';

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return formatFechaHora(iso, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export default function CatalogoScreen() {
  const [catalogo, setCatalogo] = useState<CatalogoProductos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [preview, setPreview] = useState<ProductoLista[] | null>(null);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargarCatalogo = useCallback(async () => {
    if (!API_ENABLED) return;
    setCargando(true);
    try {
      const cat = await obtenerCatalogoProductos();
      setCatalogo(cat);
    } catch {
      // Sin ruido en la consola
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  // Filtrado de búsqueda sobre el catálogo cargado
  const productosFiltrados =
    catalogo && busqueda.trim().length >= 2
      ? catalogo.productos.filter(
          (p) =>
            p.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
            p.codigo.toLowerCase().includes(busqueda.toLowerCase())
        )
      : catalogo?.productos ?? [];

  const seleccionarExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        // '*/*' da la máxima compatibilidad en Android y web
        type: Platform.OS === 'ios'
          ? ['com.microsoft.excel.xlsx', 'com.microsoft.excel.xls', 'public.data']
          : ['*/*'],
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const productos = await parseListaPreciosDesdeUri(asset.uri);

      if (productos.length === 0) {
        Alert.alert(
          'Sin datos válidos',
          'El archivo no tiene filas con código, descripción y precio mayor a 0. ' +
            'Verificá que sea el Excel correcto de Del Centro (columnas: Código, Artículo, Precio Final).'
        );
        return;
      }
      setPreview(productos);
      setArchivoNombre(asset.name ?? 'lista.xlsx');
    } catch (e) {
      Alert.alert(
        'Error al leer el archivo',
        e instanceof Error ? e.message : 'No se pudo procesar el Excel.'
      );
    }
  };

  const subirCatalogo = async () => {
    if (!preview || preview.length === 0) return;
    if (!API_ENABLED) {
      Alert.alert(
        'Sin API configurada',
        'Configurá EXPO_PUBLIC_API_URL para poder actualizar el catálogo central.'
      );
      return;
    }
    try {
      setSubiendo(true);
      await reemplazarCatalogoProductos(preview, archivoNombre ?? undefined);
      Alert.alert(
        '¡Catálogo actualizado!',
        `Se cargaron ${preview.length} productos correctamente.`
      );
      setPreview(null);
      setArchivoNombre(null);
      await cargarCatalogo();
    } catch (e) {
      Alert.alert(
        'Error al actualizar',
        e instanceof Error ? e.message : 'No se pudo actualizar el catálogo.'
      );
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Screen
      title="Catálogo / Lista de precios"
      subtitle="Importá el Excel de Del Centro para actualizar precios y productos"
      scrollable
    >
      {/* ══════════ Estado actual del catálogo ══════════ */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📦 Catálogo actual</Text>
        {!API_ENABLED ? (
          <Text style={styles.meta}>
            API no configurada. Configurá{' '}
            <Text style={styles.code}>EXPO_PUBLIC_API_URL</Text> para habilitar
            el catálogo central.
          </Text>
        ) : cargando ? (
          <ActivityIndicator color={COLORS.verdePrincipal} style={{ marginVertical: 8 }} />
        ) : catalogo ? (
          <>
            <Text style={styles.stat}>{catalogo.productos.length} productos</Text>
            {catalogo.nombreArchivo ? (
              <Text style={styles.meta}>📄 Archivo: {catalogo.nombreArchivo}</Text>
            ) : null}
            {catalogo.updatedAt ? (
              <Text style={styles.meta}>
                🕐 Última actualización: {fmtFecha(catalogo.updatedAt)}
              </Text>
            ) : null}
            <Button
              label="RECARGAR CATÁLOGO"
              variant="secondary"
              onPress={() => void cargarCatalogo()}
            />
          </>
        ) : (
          <Text style={styles.meta}>
            Sin catálogo cargado. Importá un Excel para empezar.
          </Text>
        )}
      </View>

      {/* ══════════ Importar Excel ══════════ */}
      {!preview ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📤 Importar desde Excel (.xlsx)</Text>
          <Text style={styles.hint}>
            Seleccioná el archivo Excel de la lista de precios de Del Centro.
            La app detecta automáticamente las columnas de{' '}
            <Text style={styles.bold}>Código</Text>,{' '}
            <Text style={styles.bold}>Artículo</Text> y{' '}
            <Text style={styles.bold}>Precio Final</Text>. Al confirmar, el catálogo
            se actualiza para todos los repartidores en tiempo real.
          </Text>
          <Button
            label="SELECCIONAR ARCHIVO EXCEL"
            onPress={() => void seleccionarExcel()}
          />
        </View>
      ) : (
        /* ══════════ Vista previa antes de subir ══════════ */
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✅ Vista previa — {archivoNombre}</Text>
          <Text style={styles.stat}>{preview.length} productos encontrados</Text>
          <Text style={styles.hint}>
            Revisá que los datos sean correctos. Al confirmar se{' '}
            <Text style={styles.bold}>reemplaza</Text> el catálogo completo en el sistema.
          </Text>

          <TablaProductos productos={preview.slice(0, 25)} />
          {preview.length > 25 ? (
            <Text style={styles.masItems}>… y {preview.length - 25} productos más</Text>
          ) : null}

          <Button
            label={
              subiendo
                ? 'ACTUALIZANDO…'
                : `CONFIRMAR Y SUBIR (${preview.length} productos)`
            }
            loading={subiendo}
            onPress={() => void subirCatalogo()}
          />
          <Button
            label="CANCELAR — elegir otro archivo"
            variant="danger"
            onPress={() => {
              setPreview(null);
              setArchivoNombre(null);
            }}
          />
        </View>
      )}

      {/* ══════════ Lista completa de productos actuales ══════════ */}
      {catalogo && catalogo.productos.length > 0 && !preview ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            📋 Productos en el sistema ({catalogo.productos.length})
          </Text>

          <TextInput
            style={styles.searchInput}
            placeholder="Buscá por nombre o código…"
            placeholderTextColor={COLORS.grisSecundario}
            value={busqueda}
            onChangeText={setBusqueda}
            returnKeyType="search"
          />

          <TablaProductos productos={productosFiltrados} />
          {productosFiltrados.length === 0 ? (
            <Text style={styles.masItems}>Sin resultados para "{busqueda}"</Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

// ─── Sub-componente: tabla de productos ──────────────────────────────────────
function TablaProductos({ productos }: { productos: ProductoLista[] }) {
  return (
    <View style={styles.tabla}>
      <View style={styles.tablaHeader}>
        <Text style={[styles.celda, styles.celdaCodigo, styles.celdaHeaderTxt]}>
          Código
        </Text>
        <Text style={[styles.celda, styles.celdaDesc, styles.celdaHeaderTxt]}>
          Descripción
        </Text>
        <Text style={[styles.celda, styles.celdaPrecio, styles.celdaHeaderTxt]}>
          Precio
        </Text>
      </View>
      {productos.map((p, i) => (
        <View
          key={`prod-${p.codigo}-${i}`}
          style={[styles.tablaFila, i % 2 === 1 && styles.tablaFilaAlt]}
        >
          <Text style={[styles.celda, styles.celdaCodigo]} numberOfLines={1}>
            {p.codigo}
          </Text>
          <Text style={[styles.celda, styles.celdaDesc]} numberOfLines={2}>
            {p.descripcion}
          </Text>
          <Text style={[styles.celda, styles.celdaPrecio]}>
            ${Number(p.precioUnitario).toFixed(2)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e8ecef',
  },
  cardTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 16,
    color: COLORS.grisTexto,
    marginBottom: 2,
  },
  stat: { fontFamily: 'Poppins_800ExtraBold', fontSize: 22, color: COLORS.grisTexto },
  meta: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisSecundario,
    lineHeight: 20,
  },
  code: { fontFamily: 'Poppins_600SemiBold', color: COLORS.grisTexto },
  hint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: COLORS.grisTexto,
    lineHeight: 21,
  },
  bold: { fontFamily: 'Poppins_700Bold' },

  // Campo de búsqueda
  searchInput: {
    borderWidth: 1,
    borderColor: '#d0d8d0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    backgroundColor: '#fff',
  },

  // Tabla
  tabla: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e8e0',
    marginTop: 4,
  },
  tablaHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.verdePrincipal,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  tablaFila: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: '#fff',
  },
  tablaFilaAlt: { backgroundColor: '#f5fbf1' },
  celda: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: COLORS.grisTexto,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  celdaHeaderTxt: { color: '#fff', fontFamily: 'Poppins_600SemiBold' },
  celdaCodigo: {
    width: 80,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.verdeOscuro,
  },
  celdaDesc: { flex: 1 },
  celdaPrecio: {
    width: 86,
    textAlign: 'right',
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisTexto,
  },
  masItems: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisSecundario,
    textAlign: 'center',
    paddingVertical: 10,
  },
});
