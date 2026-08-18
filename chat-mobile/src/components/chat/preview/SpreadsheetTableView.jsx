import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { moderateScale } from '../../../utils/responsive';

const ROW_NUM_WIDTH = 44;
const MIN_COL_WIDTH = 96;
const MAX_COL_WIDTH = 220;
const CHAR_WIDTH = 7.5;
const CELL_PADDING = 20;

function computeColumnWidths(headerRow, bodyRows, columnCount) {
  const widths = [];
  for (let col = 0; col < columnCount; col += 1) {
    let maxLen = String(headerRow[col] ?? '').length;
    const sampleRows = bodyRows.slice(0, 80);
    for (const row of sampleRows) {
      const len = String(row[col] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    const estimated = Math.ceil(maxLen * CHAR_WIDTH) + CELL_PADDING;
    widths.push(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, estimated)));
  }
  return widths;
}

function TableCell({ width, children, variant = 'data', style }) {
  return (
    <View style={[styles.cell, { width }, variant === 'header' && styles.headerCellWrap, style]}>
      <Text
        style={[
          variant === 'header' ? styles.headerText : styles.dataText,
          variant === 'rowNumber' && styles.rowNumberText,
        ]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {children}
      </Text>
    </View>
  );
}

export default function SpreadsheetTableView({
  headerRow = [],
  bodyRows = [],
  showRowNumbers = true,
}) {
  const columnCount = Math.max(
    headerRow.length,
    ...bodyRows.map((row) => row.length),
    1,
  );

  const columnWidths = useMemo(
    () => computeColumnWidths(headerRow, bodyRows, columnCount),
    [headerRow, bodyRows, columnCount],
  );

  const tableWidth = useMemo(() => {
    const colsWidth = columnWidths.reduce((sum, w) => sum + w, 0);
    return colsWidth + (showRowNumbers ? ROW_NUM_WIDTH : 0);
  }, [columnWidths, showRowNumbers]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator
        contentContainerStyle={{ minWidth: '100%' }}
      >
        <View style={{ width: Math.max(tableWidth, 320) }}>
          <View style={styles.headerRow}>
            {showRowNumbers ? (
              <TableCell width={ROW_NUM_WIDTH} variant="rowNumber">
                #
              </TableCell>
            ) : null}
            {Array.from({ length: columnCount }).map((_, colIndex) => (
              <TableCell
                key={`header-${colIndex}`}
                width={columnWidths[colIndex]}
                variant="header"
              >
                {String(headerRow[colIndex] ?? '')}
              </TableCell>
            ))}
          </View>

          <ScrollView
            style={styles.bodyScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            bounces={false}
          >
            {bodyRows.map((row, rowIndex) => (
              <View
                key={`row-${rowIndex}`}
                style={[
                  styles.dataRow,
                  rowIndex % 2 === 1 && styles.dataRowAlt,
                ]}
              >
                {showRowNumbers ? (
                  <TableCell width={ROW_NUM_WIDTH} variant="rowNumber">
                    {rowIndex + 2}
                  </TableCell>
                ) : null}
                {Array.from({ length: columnCount }).map((_, colIndex) => (
                  <TableCell
                    key={`cell-${rowIndex}-${colIndex}`}
                    width={columnWidths[colIndex]}
                  >
                    {String(row[colIndex] ?? '')}
                  </TableCell>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
    zIndex: 2,
  },
  dataRow: {
    flexDirection: 'row',
    backgroundColor: '#0d1117',
  },
  dataRowAlt: {
    backgroundColor: '#11161d',
  },
  bodyScroll: {
    flex: 1,
  },
  cell: {
    paddingHorizontal: moderateScale(10),
    paddingVertical: moderateScale(9),
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#30363d',
    justifyContent: 'center',
    minHeight: 40,
  },
  headerCellWrap: {
    backgroundColor: '#161b22',
  },
  headerText: {
    color: '#e6edf3',
    fontWeight: '700',
    fontSize: moderateScale(12),
  },
  dataText: {
    color: '#c9d1d9',
    fontSize: moderateScale(12),
    lineHeight: moderateScale(17),
  },
  rowNumberText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: moderateScale(11),
    textAlign: 'right',
    fontWeight: '500',
  },
});
