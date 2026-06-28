import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { compartirTexto } from '@/lib/compartir';
import { formatFecha } from '@/lib/fechaHora';
import { obtenerCatalogoProductos } from '@/services/catalogoProductos';
import type { ProductoLista } from '@/types';

interface ItemCotizacion {
  producto: ProductoLista;
  cantidad: number;
}

function fmtMoney(n: number): string {
  return n.toFixed(2);
}

function generarTextoCotizacion(items: ItemCotizacion[]): string {
  const fecha = formatFecha(Date.now(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lineas = items.map((it, i) => {
    const subtotal = it.cantidad * it.producto.precioUnitario;
    return `${i + 1}. ${it.producto.descripcion}\n   ${it.cantidad} x $${fmtMoney(it.producto.precioUnitario)} = $${fmtMoney(subtotal)}`;
  });
  const total = items.reduce((acc, it) => acc + it.cantidad * it.producto.precioUnitario, 0);
  return [
    'COTIZACIÓN — Del Centro Pinturerías',
    `Fecha: ${fecha}`,
    '',
    ...lineas,
    '',
    `TOTAL: $${fmtMoney(total)}`,
  ].join('\n');
}

export default function CatalogoRepartidor() {
  const [catalogo, setCatalogo] = useState<ProductoLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [modoCotizacion, setModoCotizacion] = useState(false);
  const [items, setItems] = useState<ItemCotizacion[]>([]);

  useEffect(() => {
    void obtenerCatalogoProductos()
      .then((cat) => setCatalogo(cat?.productos ?? []))
      .finally(() => setCargando(false));
  }, []);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return catalogo;
    return catalogo.filter(
      (p) => p.descripcion.toLowerCase().includes(s) || p.codigo.toLowerCase().includes(s)
    );
  }, [catalogo, q]);

  const total = useMemo(
    () => items.reduce((acc, it) => acc + it.cantidad * it.producto.precioUnitario, 0),
    [items]
  );

  const agregarItem = (producto: ProductoLista) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.producto.codigo === producto.codigo);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + 1 };
        return copia;
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (codigo: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => (it.producto.codigo === codigo ? { ...it, cantidad: it.cantidad + delta } : it))
        .filter((it) => it.cantidad > 0)
    );
  };

  const quitarItem = (codigo: string) => {
    setItems((prev) => prev.filter((it) => it.producto.codigo !== codigo));
  };

  const compartirCotizacion = () => {
    if (items.length === 0) return;
    void compartirTexto(generarTextoCotizacion(items), 'Cotización Del Centro Pinturerías');
  };

  const salirDeCotizacion = () => {
    setModoCotizacion(false);
    setItems([]);
  };

  return (
    <Screen
      title="Catálogo de productos"
      subtitle={modoCotizacion ? 'Armando cotización' : 'Precios y detalles'}
      showBack
      scrollable
    >
      <View style={styles.toggleRow}>
        <Button
          label={modoCotizacion ? 'VOLVER AL CATÁLOGO' : 'COTIZACIÓN'}
          variant={modoCotizacion ? 'secondary' : 'primary'}
          iconLeft={<MaterialIcons name={modoCotizacion ? 'arrow-back' : 'request-quote'} size={16} color={modoCotizacion ? COLORS.verdeOscuro : '#fff'} />}
          onPress={() => (modoCotizacion ? salirDeCotizacion() : setModoCotizacion(true))}
        />
      </View>

      {modoCotizacion && items.length > 0 ? (
        <View style={styles.cotizacionCard}>
          <Text style={styles.cotizacionTitulo}>
            Cotización · {formatFecha(Date.now(), { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Text>
          {items.map((it) => (
            <View key={it.producto.codigo} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemNombre} numberOfLines={2}>{it.producto.descripcion}</Text>
                <Text style={styles.itemPrecio}>
                  ${fmtMoney(it.producto.precioUnitario)} c/u · Subtotal ${fmtMoney(it.cantidad * it.producto.precioUnitario)}
                </Text>
              </View>
              <View style={styles.cantidadBox}>
                <Pressable style={styles.cantidadBtn} onPress={() => cambiarCantidad(it.producto.codigo, -1)} hitSlop={8}>
                  <MaterialIcons name="remove" size={16} color={COLORS.verdeOscuro} />
                </Pressable>
                <Text style={styles.cantidadTexto}>{it.cantidad}</Text>
                <Pressable style={styles.cantidadBtn} onPress={() => cambiarCantidad(it.producto.codigo, 1)} hitSlop={8}>
                  <MaterialIcons name="add" size={16} color={COLORS.verdeOscuro} />
                </Pressable>
              </View>
              <Pressable onPress={() => quitarItem(it.producto.codigo)} hitSlop={8} style={styles.quitarBtn}>
                <MaterialIcons name="close" size={16} color="#c43c3c" />
              </Pressable>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValor}>${fmtMoney(total)}</Text>
          </View>
          <Button
            label="COMPARTIR COTIZACIÓN"
            iconLeft={<MaterialIcons name="share" size={16} color="#fff" />}
            onPress={compartirCotizacion}
          />
        </View>
      ) : modoCotizacion ? (
        <Text style={styles.hint}>Tocá productos del catálogo abajo para agregarlos a la cotización.</Text>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Buscar producto por nombre o código…"
        placeholderTextColor={COLORS.grisSecundario}
        value={q}
        onChangeText={setQ}
      />

      {cargando ? (
        <Text style={styles.hint}>Cargando catálogo…</Text>
      ) : filtrados.length === 0 ? (
        <Text style={styles.hint}>No se encontraron productos.</Text>
      ) : (
        <ScrollView nestedScrollEnabled style={styles.lista}>
          {filtrados.map((p) => (
            <Pressable
              key={p.codigo}
              style={({ pressed }) => [styles.productoRow, pressed && styles.productoRowPressed]}
              onPress={() => (modoCotizacion ? agregarItem(p) : undefined)}
            >
              <View style={styles.productoInfo}>
                <Text style={styles.productoNombre} numberOfLines={2}>{p.descripcion}</Text>
                <Text style={styles.productoCodigo}>Cód. {p.codigo}</Text>
              </View>
              <View style={styles.productoDerecha}>
                <Text style={styles.productoPrecio}>${fmtMoney(p.precioUnitario)}</Text>
                {modoCotizacion ? <MaterialIcons name="add-circle" size={22} color={COLORS.verdePrincipal} /> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: { marginBottom: 4 },
  hint: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisSecundario,
    marginVertical: 8,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dcdcdc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 50,
    fontFamily: 'Poppins_400Regular',
    backgroundColor: '#fff',
    fontSize: 15,
  },
  lista: { maxHeight: 520 },
  productoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ececec',
    gap: 10,
  },
  productoRowPressed: { backgroundColor: '#f5faf2' },
  productoInfo: { flex: 1, gap: 2 },
  productoNombre: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: COLORS.grisTexto },
  productoCodigo: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: COLORS.grisSecundario },
  productoDerecha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productoPrecio: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: COLORS.verdeOscuro },

  cotizacionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.verdePrincipal,
    gap: 8,
  },
  cotizacionTitulo: { fontFamily: 'Poppins_700Bold', fontSize: 15, color: COLORS.verdeOscuro, marginBottom: 4 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
  },
  itemInfo: { flex: 1, gap: 2 },
  itemNombre: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: COLORS.grisTexto },
  itemPrecio: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: COLORS.grisSecundario },
  cantidadBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cantidadBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.grisClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cantidadTexto: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto, minWidth: 18, textAlign: 'center' },
  quitarBtn: { padding: 4 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  totalLabel: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: COLORS.grisTexto },
  totalValor: { fontFamily: 'Poppins_800ExtraBold', fontSize: 20, color: COLORS.verdeOscuro },
});
