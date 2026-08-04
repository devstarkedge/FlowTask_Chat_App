import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useConnectivity from '../hooks/useConnectivity';

export const OfflineBanner = () => {
  const { isOnline } = useConnectivity();

  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Connection lost. You are currently offline.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ff9500',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default OfflineBanner;
