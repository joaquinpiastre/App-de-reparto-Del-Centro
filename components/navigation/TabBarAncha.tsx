import { BottomTabBar } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = BottomTabBarProps & { style?: StyleProp<ViewStyle> };

/**
 * Barra inferior a todo el ancho: cada pestaña ocupa el mismo espacio (flex) y
 * se suma altura + padding para que ícono y texto no queden apretados.
 */
export function TabBarAncha({ style, ...props }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 16);
  const extraBottom = 14;
  const padTop = 16;
  const minContent = Platform.OS === 'web' ? 80 : 88;

  return (
    <BottomTabBar
      {...props}
      insets={{ top: 0, left: 0, right: 0, bottom: 0 }}
      style={[
        styles.base,
        style,
        {
          paddingTop: padTop,
          paddingBottom: bottom + extraBottom,
          paddingHorizontal: 0,
          minHeight: padTop + minContent + bottom + extraBottom,
          width: '100%',
          alignSelf: 'stretch',
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#dde3e8',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 -4px 12px rgba(0,0,0,0.06)' } as object)
      : null),
  },
});
