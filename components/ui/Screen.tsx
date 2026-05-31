import { Children, isValidElement, type PropsWithChildren } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { COLORS } from '@/constants/colors';

interface Props extends PropsWithChildren {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  scrollable?: boolean;
  showHome?: boolean;
}

export function Screen({ title, subtitle, showBack, scrollable, showHome, children }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const isCompact = width < 420;
  const bodyHorizontal = isCompact ? 12 : 16;
  const maxBodyWidth = width >= 1360 ? 1180 : width >= 1024 ? 1040 : 960;
  const headerPaddingTop = isWeb ? 18 : insets.top + 12;
  const headerPaddingBottom = isCompact ? 14 : 18;

  const spaced = Children.map(children, (child, index) => {
    if (!isValidElement(child)) return child;
    return (
      <View key={index} style={index > 0 ? styles.childSpacing : undefined}>
        {child}
      </View>
    );
  });

  const Root = View;
  const rootStyle = isWeb ? [styles.safe, styles.safeWeb] : styles.safe;

  return (
    <Root style={rootStyle}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: bodyHorizontal,
            paddingTop: headerPaddingTop,
            paddingBottom: headerPaddingBottom,
          },
        ]}
      >
        {(showBack || showHome) ? (
          <View style={styles.headerTopRow}>
            {showBack ? (
              <Pressable
                onPress={() => router.back()}
                style={styles.backBtn}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Volver"
              >
                <MaterialIcons name="arrow-back" size={24} color="#fff" />
              </Pressable>
            ) : <View />}
            {showHome ? (
              <Pressable
                onPress={() => router.replace('/(repartidor)')}
                style={styles.homeBtn}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Ir al inicio"
              >
                <MaterialIcons name="home" size={26} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.title, { fontSize: isCompact ? 20 : 24 }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { fontSize: isCompact ? 12 : 13 }]}>{subtitle}</Text> : null}
      </View>
      {isWeb ? (
        <ScrollView style={styles.bodyScrollWeb} contentContainerStyle={styles.bodyScrollWebContent}>
          <View
            style={[
              styles.body,
              { paddingHorizontal: bodyHorizontal, paddingVertical: isCompact ? 12 : 16 },
              styles.bodyWeb,
              { maxWidth: maxBodyWidth },
            ]}
          >
            {spaced}
          </View>
        </ScrollView>
      ) : scrollable ? (
        <ScrollView
          style={styles.bodyScrollNative}
          contentContainerStyle={[
            styles.bodyScrollNativeContent,
            { paddingHorizontal: bodyHorizontal, paddingVertical: isCompact ? 12 : 16 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {spaced}
        </ScrollView>
      ) : (
        <View style={[styles.body, { paddingHorizontal: bodyHorizontal, paddingVertical: isCompact ? 12 : 16 }]}>
          {spaced}
        </View>
      )}
    </Root>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.grisClaro },
  safeWeb: { flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' },
  header: { backgroundColor: COLORS.verdePrincipal },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    minHeight: 28,
  },
  backBtn: {
    alignSelf: 'flex-start',
    padding: 2,
  },
  homeBtn: {
    alignSelf: 'flex-start',
    padding: 2,
    marginLeft: 'auto',
  },
  title: { color: '#fff', fontFamily: 'Poppins_800ExtraBold' },
  subtitle: { color: '#edf6e6', fontFamily: 'Poppins_400Regular', marginTop: 2 },
  body: { flex: 1, minHeight: 0 },
  bodyWeb: {
    flex: 1,
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
  },
  bodyScrollWeb: { flex: 1, width: '100%' },
  bodyScrollWebContent: { flexGrow: 1, paddingBottom: 24 },
  bodyScrollNative: { flex: 1 },
  bodyScrollNativeContent: { flexGrow: 1, paddingBottom: 32 },
  childSpacing: { marginTop: 12 },
});
