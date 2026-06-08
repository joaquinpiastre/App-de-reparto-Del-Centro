import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';

import { TabBarAncha } from '@/components/navigation/TabBarAncha';
import { COLORS } from '@/constants/colors';
import { useAppStore } from '@/store/useAppStore';

export default function LogisticaLayout() {
  const usuario = useAppStore((s) => s.usuario);

  if (!usuario || usuario.rol !== 'logistica') {
    return <Redirect href="/(auth)/login" />;
  }

  return <LogisticaTabs />;
}

function LogisticaTabs() {
  const shellStyle = Platform.OS === 'web' ? { flex: 1, width: '100%' as const, minHeight: 0 } : { flex: 1 };

  return (
    <View style={shellStyle}>
      <Tabs
        tabBar={(props) => <TabBarAncha {...props} />}
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: false,
          tabBarActiveTintColor: COLORS.verdeOscuro,
          tabBarInactiveTintColor: '#9aa5af',
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 9,
            fontFamily: 'Poppins_600SemiBold',
            marginTop: 2,
            marginBottom: 0,
            width: '100%',
            textAlign: 'center',
          },
          tabBarIconStyle: { marginTop: 0, marginBottom: 2 },
          tabBarItemStyle: {
            flex: 1,
            minWidth: 0,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 6,
            paddingHorizontal: 1,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Historial',
            tabBarIcon: ({ color, focused }) => <MaterialIcons name="history" size={focused ? 23 : 21} color={color} />,
          }}
        />
        <Tabs.Screen
          name="pedidos"
          options={{
            title: 'Pedidos',
            tabBarIcon: ({ color, focused }) => <MaterialIcons name="storefront" size={focused ? 23 : 21} color={color} />,
          }}
        />
        <Tabs.Screen
          name="cuenta"
          options={{
            title: 'Cuenta',
            tabBarIcon: ({ color, focused }) => <MaterialIcons name="logout" size={focused ? 23 : 21} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
