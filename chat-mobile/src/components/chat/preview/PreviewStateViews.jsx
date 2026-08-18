import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Download, FileText, File as FileIcon, RotateCw } from 'lucide-react-native';
import { formatPreviewError } from '../../../utils/filePreviewInfo';
import { moderateScale, scale, verticalScale } from '../../../utils/responsive';

export function PreviewLoading({ label = 'Loading...' }) {
  return (
    <View style={styles.centerBox}>
      <ActivityIndicator color="#1264a3" size="large" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function PreviewError({ title, message, onDownload, onRetry, retryLabel = 'Retry' }) {
  return (
    <View style={styles.centerBox}>
      <FileText size={48} color="rgba(255,255,255,0.3)" />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{formatPreviewError(message)}</Text>
      <View style={styles.actionRow}>
        {onRetry ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={onRetry}>
            <RotateCw size={16} color="#fff" />
            <Text style={styles.secondaryBtnText}>{retryLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {onDownload ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={onDownload}>
            <Download size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Download Instead</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function PreviewUnsupported({ onDownload }) {
  return (
    <View style={styles.centerBox}>
      <FileIcon size={64} color="rgba(255,255,255,0.4)" />
      <Text style={styles.errorTitle}>Preview not available</Text>
      <Text style={styles.errorText}>Download this file to open it locally.</Text>
      {onDownload ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={onDownload}>
          <Download size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Download</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: moderateScale(20),
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: moderateScale(14),
    marginTop: 10,
  },
  errorTitle: {
    color: '#fff',
    fontSize: moderateScale(16),
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: moderateScale(14),
    textAlign: 'center',
    maxWidth: 320,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1264a3',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(8),
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#30363d',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(8),
    gap: 8,
  },
  secondaryBtnText: {
    color: '#fff',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
});
