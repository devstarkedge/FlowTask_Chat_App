import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { moderateScale } from '../../../utils/responsive';
import SpreadsheetTableView from './SpreadsheetTableView';

export default function CsvPreviewView({ rows }) {
  const [showAll, setShowAll] = useState(false);
  if (!rows?.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>Empty CSV</Text>
      </View>
    );
  }

  const headerRow = rows[0] || [];
  const bodyRows = showAll ? rows.slice(1) : rows.slice(1, 201);
  const hasMore = rows.length > 201;

  return (
    <View style={styles.container}>
      <SpreadsheetTableView headerRow={headerRow} bodyRows={bodyRows} />

      {!showAll && hasMore ? (
        <TouchableOpacity style={styles.moreBtn} onPress={() => setShowAll(true)}>
          <Text style={styles.moreBtnText}>Show all {rows.length - 1} rows</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.6)' },
  moreBtn: {
    alignItems: 'center',
    padding: moderateScale(12),
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    backgroundColor: '#161b22',
  },
  moreBtnText: {
    color: '#58a6ff',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
});
