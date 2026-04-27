import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { notificacionLocal } from '@/services/notificaciones';
import { suscribirPedidosCalle } from '@/services/pedidosCalle';
import { useAppStore } from '@/store/useAppStore';
import { usePedidosCalleStore } from '@/store/usePedidosCalleStore';

export default function AdminLayout() {
  const usuario = useAppStore((s) => s.usuario);
  const pedidos = usePedidosCalleStore((s) => s.pedidos);
  const boot = useRef(true);
  const ultimaNotificada = useRef<string | null>(null);

  if (!usuario || usuario.rol !== 'admin') {
    return <Redirect href="/(auth)/login" />;
  }

  useEffect(() => {
    return suscribirPedidosCalle(() => {});
  }, []);

  useEffect(() => {
    const top = pedidos[0];
    if (!top || top.estado !== 'pendiente') return;
    if (boot.current) {
      boot.current = false;
      ultimaNotificada.current = top.id;
      return;
    }
    if (ultimaNotificada.current !== top.id) {
      ultimaNotificada.current = top.id;
      void notificacionLocal(
        'Nuevo pedido en calle',
        `${top.calleMostrada} · ${top.repartidorNombre} · $${top.total.toFixed(0)}`
      );
    }
  }, [pedidos]);

  const shellStyle = Platform.OS === 'web' ? { flex: 1, width: '100%' as const, minHeight: 0 } : { flex: 1 };

  return (
    <View style={shellStyle}>
      <Tabs
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: false,
          tabBarActiveTintColor: COLORS.verdeOscuro,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <MaterialIcons name="dashboard" size={20} color={color} /> }} />
        <Tabs.Screen name="pedidos-calle" options={{ title: 'Pedidos', tabBarIcon: ({ color }) => <MaterialIcons name="notifications-active" size={20} color={color} /> }} />
        <Tabs.Screen name="mapa-vivo" options={{ title: 'Mapa', tabBarIcon: ({ color }) => <MaterialIcons name="map" size={20} color={color} /> }} />
        <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: ({ color }) => <MaterialIcons name="history" size={20} color={color} /> }} />
        <Tabs.Screen name="estadisticas" options={{ title: 'Stats', tabBarIcon: ({ color }) => <MaterialIcons name="bar-chart" size={20} color={color} /> }} />
        <Tabs.Screen name="clientes" options={{ title: 'Clientes', tabBarIcon: ({ color }) => <MaterialIcons name="groups" size={20} color={color} /> }} />
      </Tabs>
    </View>
  );
}
