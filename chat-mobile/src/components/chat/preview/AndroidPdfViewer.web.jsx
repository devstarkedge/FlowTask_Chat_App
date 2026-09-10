import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AndroidPdfViewer({ localPath, onError }) {
  if (!localPath) return null;

  return (
    <View style={styles.container}>
      <iframe
        src={localPath}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#525659',
        }}
        title="PDF Preview"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#525659',
  },
});
