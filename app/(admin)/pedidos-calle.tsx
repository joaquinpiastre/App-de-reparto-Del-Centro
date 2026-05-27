import { useEffect, useMemo } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { COLORS } from '@/constants/colors';
import { actualizarEstadoPedidoCalle, suscribirPedidosCalle } from '@/services/pedidosCalle';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';
import type { EstadoPedidoCalle, PedidoCalle } from '@/types';

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

// ─── Genera el HTML del ticket para impresión ────────────────────────────────
function generarHTMLPedido(p: PedidoCalle): string {
  const itemsHtml = (p.items ?? [])
    .map(
      (it) => `
      <tr>
        <td class="cod">${it.codigo ?? '—'}</td>
        <td>${it.descripcion}</td>
        <td class="num">${it.cantidad}</td>
        <td class="num">$${Number(it.precioUnitario).toFixed(2)}</td>
        <td class="num bold">$${Number(it.subtotal).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  const mismaCalleHtml =
    p.clientesMismaCalle && p.clientesMismaCalle.length > 0
      ? `<div class="misma-calle">
          <strong>Clientes de la ruta en esa calle:</strong>
          <ul>${p.clientesMismaCalle.map((c) => `<li>${c.nombre} — ${c.direccion}</li>`).join('')}</ul>
        </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pedido — Del Centro Pinturerias</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #333; font-size: 14px; }
    h1 { color: #4A8F14; font-size: 24px; margin-bottom: 2px; }
    .empresa { color: #888; font-size: 13px; margin-bottom: 16px; }
    hr { border: none; border-top: 2px solid #6DC921; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 16px; }
    .field label { color: #888; font-size: 12px; display: block; }
    .field span { font-weight: 600; }
    .badge {
      background: #e8f5e9; color: #4A8F14; padding: 2px 10px;
      border-radius: 4px; display: inline-block; font-weight: 700;
      text-transform: uppercase; font-size: 12px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    thead th { background: #6DC921; color: #fff; padding: 8px 10px; text-align: left; font-size: 13px; }
    thead th.num { text-align: right; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f9f9f9; }
    td.cod { color: #4A8F14; font-weight: 600; white-space: nowrap; }
    td.num { text-align: right; white-space: nowrap; }
    td.bold { font-weight: 700; }
    .total-box { margin-top: 14px; text-align: right; }
    .total { font-size: 22px; font-weight: 800; color: #4A8F14; }
    .notas { margin-top: 14px; padding: 10px 14px; background: #fff8e1; border-radius: 8px; font-size: 13px; }
    .misma-calle { margin-top: 14px; padding: 10px 14px; background: #e8f5e9; border-radius: 8px; font-size: 13px; }
    .misma-calle ul { margin-top: 6px; padding-left: 18px; }
    footer { margin-top: 40px; color: #aaa; font-size: 11px; border-top: 1px solid #eee; padding-top: 10px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1>Del Centro Pinturerias</h1>
  <p class="empresa">Av. Hipólito Yrigoyen 621, San Rafael, Mendoza</p>
  <hr>
  <div class="grid">
    <div class="field"><label>Fecha</label><span>${fmtFecha(p.creadoEn)}</span></div>
    <div class="field"><label>Estado</label><span class="badge">${p.estado}</span></div>
    <div class="field"><label>Repartidor</label><span>${p.repartidorNombre}</span></div>
    ${p.clienteNombre ? `<div class="field"><label>Cliente</label><span>${p.clienteNombre}</span></div>` : ''}
    <div class="field" style="grid-column:1/-1"><label>Calle de referencia</label><span>${p.calleMostrada}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Descripción</th>
        <th class="num">Cant.</th>
        <th class="num">P. Unit.</th>
        <th class="num">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="total-box">
    <span class="total">Total: $${Number(p.total ?? 0).toFixed(2)}</span>
  </div>

  ${p.notas ? `<div class="notas">📝 <strong>Notas del repartidor:</strong> ${p.notas}</div>` : ''}
  ${mismaCalleHtml}

  <footer>
    Impreso desde Del Centro App · ${new Date().toLocaleString('es-AR')}
  </footer>
</body>
</html>`;
}

// ─── Imprime un pedido (web → nueva ventana, nativo → expo-print) ─────────────
async function imprimirPedido(p: PedidoCalle) {
  try {
    const html = generarHTMLPedido(p);
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
    Alert.alert('Error', 'No se pudo imprimir el pedido.');
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PedidosCalleAdmin() {
  const pedidosCalle = usePedidosCalleStore((s) => s.pedidos);

  useEffect(() => suscribirPedidosCalle(() => {}), []);

  const pedidosCalleActivos = useMemo(
    () =>
      [...pedidosCalle]
        .filter((p) => p.estado !== 'retirado' && p.estado !== 'cancelado')
        .sort((a, b) => b.creadoEn - a.creadoEn),
    [pedidosCalle]
  );

  const esEstadoFinal = (e: EstadoPedidoCalle) => e === 'retirado' || e === 'cancelado';

  const cambiarEstado = async (pedido: PedidoCalle, estado: PedidoCalle['estado']) => {
    try {
      await actualizarEstadoPedidoCalle(pedido.id, estado);
    } catch (e) {
      if (Platform.OS === 'web') {
        globalThis.alert?.(
          `No se pudo actualizar el estado: ${e instanceof Error ? e.message : e}`
        );
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
      }
    }
  };

  return (
    <Screen
      title="Pedidos en calle"
      subtitle="Pedidos levantados por los repartidores"
      scrollable
    >
      <Text style={styles.resumen}>
        Activos: {pedidosCalleActivos.length} · Total en sistema: {pedidosCalle.length}
      </Text>

      {pedidosCalleActivos.length === 0 ? (
        <Text style={styles.empty}>
          {pedidosCalle.length === 0
            ? 'Todavía no hay pedidos desde la calle.'
            : 'No hay pedidos activos. Los finalizados están en el Historial.'}
        </Text>
      ) : (
        pedidosCalleActivos.map((p) => (
          <View key={p.id} style={styles.card}>
            {/* Cabecera del card */}
            <Text style={styles.fecha}>{fmtFecha(p.creadoEn)}</Text>
            <View style={styles.tagRow}>
              <View style={styles.repartidorTag}>
                <Text style={styles.repartidorTagText}>{p.repartidorNombre}</Text>
              </View>
              {p.clienteNombre ? (
                <View style={styles.clienteTag}>
                  <Text style={styles.clienteTagText}>{p.clienteNombre}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.titulo}>{p.calleMostrada}</Text>
            <Text style={styles.row}>
              <Text style={styles.estadoBadge}>Estado: {p.estado}</Text>
              {' · '}
              Total ${Number(p.total ?? 0).toFixed(2)}
            </Text>

            {/* Items con código visible */}
            {(p.items ?? []).length > 0 ? (
              <View style={styles.itemsBox}>
                {(p.items ?? []).map((it, idx) => (
                  <View key={`${p.id}-it-${idx}`} style={styles.itemFila}>
                    {it.codigo ? (
                      <View style={styles.codigoBadge}>
                        <Text style={styles.codigoBadgeText}>{it.codigo}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.itemDescripcion} numberOfLines={3}>
                      {it.cantidad} × {it.descripcion}
                    </Text>
                    <Text style={styles.itemSubtotal}>
                      ${Number(it.subtotal).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {p.notas ? (
              <Text style={styles.notas}>📝 Nota: {p.notas}</Text>
            ) : null}

            {/* Clientes en la misma calle */}
            {p.clientesMismaCalle && p.clientesMismaCalle.length > 0 ? (
              <View style={styles.mismaCalleBox}>
                <Text style={styles.mismaCalleTit}>Clientes en la misma calle (ruta)</Text>
                {p.clientesMismaCalle.map((c) => (
                  <Text key={c.direccion + c.nombre} style={styles.mismaCalleRow}>
                    · {c.nombre} — {c.direccion}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Botón imprimir — siempre visible */}
            <Pressable
              style={({ pressed }) => [styles.imprimirBtn, pressed && styles.imprimirBtnPressed]}
              onPress={() => void imprimirPedido(p)}
              accessibilityRole="button"
              accessibilityLabel="Imprimir pedido"
            >
              <Text style={styles.imprimirBtnTxt}>🖨️  IMPRIMIR PEDIDO</Text>
            </Pressable>

            {/* Acciones de estado */}
            {!esEstadoFinal(p.estado) ? (
              <View style={[styles.actions, styles.actionsWrap]}>
                <Button
                  label="VISTO"
                  variant="secondary"
                  onPress={() => void cambiarEstado(p, 'visto')}
                />
                <Button
                  label="ARMADO"
                  variant="primary"
                  onPress={() => void cambiarEstado(p, 'armado')}
                />
                <Button
                  label="RETIRADO"
                  variant="warning"
                  onPress={() => void cambiarEstado(p, 'retirado')}
                />
                <Button
                  label="CANCELAR"
                  variant="danger"
                  onPress={() => void cambiarEstado(p, 'cancelado')}
                />
              </View>
            ) : (
              <Text style={styles.finalizadoTxt}>
                Pedido finalizado — no requiere acción.
              </Text>
            )}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  resumen: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.grisSecundario,
    marginBottom: 4,
  },
  empty: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.grisSecundario,
    marginTop: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    gap: 6,
  },
  fecha: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
    color: COLORS.grisSecundario,
  },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  titulo: { fontFamily: 'Poppins_700Bold', color: COLORS.grisTexto, fontSize: 16 },
  row: { fontFamily: 'Poppins_400Regular', color: COLORS.grisSecundario, marginTop: 2 },
  estadoBadge: { fontFamily: 'Poppins_600SemiBold', color: COLORS.verdeOscuro },

  // Items
  itemsBox: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
    gap: 6,
  },
  itemFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  codigoBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  codigoBadgeText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    color: COLORS.verdeOscuro,
    letterSpacing: 0.3,
  },
  itemDescripcion: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisTexto,
    flex: 1,
    lineHeight: 19,
  },
  itemSubtotal: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.grisTexto,
    alignSelf: 'center',
  },

  notas: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.verdeOscuro,
    fontSize: 13,
  },

  // Imprimir
  imprimirBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.acentoAzul,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  imprimirBtnPressed: { backgroundColor: '#e3f2fd' },
  imprimirBtnTxt: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13,
    color: COLORS.acentoAzul,
  },

  // Tags
  repartidorTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  repartidorTagText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: COLORS.verdeOscuro,
  },
  clienteTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  clienteTagText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: '#1565c0',
  },

  // Misma calle
  mismaCalleBox: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  mismaCalleTit: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    color: COLORS.grisTexto,
    marginBottom: 4,
  },
  mismaCalleRow: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    color: COLORS.grisSecundario,
  },

  // Acciones
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionsWrap: { flexWrap: 'wrap' },
  finalizadoTxt: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: COLORS.grisSecundario,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
