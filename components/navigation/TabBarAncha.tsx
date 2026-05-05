import { BottomTabBar } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = BottomTabBarProps & { style?: StyleProp<ViewStyle> };

/**
 * Barra inferior a todo el ancho.
 * En web, viewport-fit=cover (definido en app/+html.tsx) permite que
 * useSafeAreaInsets() devuelva el inset real de la barra de navegación
 * del teléfono. Se suma un extra conservador para no quedar al borde.
 */
export function TabBarAncha({ style, ...props }: Props) {
  const insets = useSafeAreaInsets();

  // En web: insets.bottom incluye la barra de nav del teléfono gracias a
  // viewport-fit=cover. Se asegura un mínimo razonable en caso de que el
  // browser no lo reporte (ej. Chrome sin gestos en algunos Xiaomi).
  const safeBottom = Platform.OS === 'web'
    ? Math.max(insets.bottom, 16)
    : Math.max(insets.bottom, 16);

  const padTop = 12;
  const padBottom = safeBottom + 10;
  const minContent = 54;

  return (
    <BottomTabBar
      {...props}
      insets={{ top: 0, left: 0, right: 0, bottom: 0 }}
      style={[
        styles.base,
        style,
        {
          paddingTop: padTop,
          paddingBottom: padBottom,
          paddingHorizontal: 0,
          minHeight: padTop + minContent + padBottom,
          width: '100%',
          alignSelf: 'stretch',
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8ecef',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 -2px 16px rgba(0,0,0,0.07)' } as object)
      : null),
  },
});
