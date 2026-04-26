import { StyleSheet, Text, View } from 'react-native';

export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#e5f5d8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#4A8F14' },
});
