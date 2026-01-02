import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

export default function TrackerDetailScreen({ route }) {
  const { trackerId } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tracker Detail</Text>
      <Text style={styles.subtitle}>Tracker ID: {trackerId}</Text>
      <Text style={styles.subtitle}>Detail view coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});

