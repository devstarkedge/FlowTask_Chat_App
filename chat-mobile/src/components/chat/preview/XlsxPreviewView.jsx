import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { moderateScale } from '../../../utils/responsive';
import SpreadsheetTableView from './SpreadsheetTableView';

export default function XlsxPreviewView({ sheets }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const sheet = sheets?.[activeSheet];
  if (!sheet) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>Empty sheet</Text>
      </View>
    );
  }

  const allRows = sheet.data || [];
  const headerRow = allRows[0] || [];
  const bodyRows = showAll ? allRows.slice(1) : allRows.slice(1, 201);
  const hasMore = allRows.length > 201;

  return (
    <View style={styles.container}>
      {sheets.length > 1 ? (
        <ScrollView horizontal style={styles.tabs} showsHorizontalScrollIndicator={false}>
          {sheets.map((item, index) => (
            <TouchableOpacity
              key={item.name || index}
              style={[styles.tab, index === activeSheet && styles.tabActive]}
              onPress={() => {
                setActiveSheet(index);
                setShowAll(false);
              }}
            >
              <Text style={[styles.tabText, index === activeSheet && styles.tabTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <SpreadsheetTableView headerRow={headerRow} bodyRows={bodyRows} />

      {!showAll && hasMore ? (
        <TouchableOpacity style={styles.moreBtn} onPress={() => setShowAll(true)}>
          <Text style={styles.moreBtnText}>Show all {allRows.length - 1} rows</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.6)' },
  tabs: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    backgroundColor: '#161b22',
    flexGrow: 0,
  },
  tab: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(10),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#1264a3',
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateScale(13),
  },
  tabTextActive: {
    color: '#58a6ff',
    fontWeight: '700',
  },
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
