import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { getLanguageLabelFromExt } from '../../../utils/filePreviewInfo';
import { moderateScale } from '../../../utils/responsive';

export default function CodePreviewView({ text, ext, isJson }) {
  const displayText = isJson
    ? (() => {
        try {
          return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          return text;
        }
      })()
    : text;

  const lineCount = displayText.split('\n').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.badge}>{getLanguageLabelFromExt(ext)}</Text>
        <Text style={styles.lines}>{lineCount} lines</Text>
      </View>
      <ScrollView style={styles.scroll} horizontal={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <Text style={styles.code} selectable>{displayText}</Text>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    backgroundColor: '#161b22',
  },
  badge: {
    color: '#f59e0b',
    fontSize: moderateScale(12),
    fontWeight: '700',
  },
  lines: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: moderateScale(12),
  },
  scroll: {
    flex: 1,
    padding: moderateScale(16),
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: moderateScale(13),
    color: '#e6edf3',
    lineHeight: 22,
  },
});
