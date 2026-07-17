import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { X, Layers, FileText } from 'lucide-react-native';
import { canvasAPI } from '../services/api';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


export default function RecentCanvasesModal({ visible, onClose, onSelectCanvas, colors }) {
  const [canvases, setCanvases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      loadCanvases();
    }
  }, [visible]);

  const loadCanvases = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await canvasAPI.getMy();
      if (data.success && data.data) {
        setCanvases(data.data);
      }
    } catch (e) {
      setError('Failed to load canvases');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, { borderBottomColor: colors.border }]}
      onPress={() => {
        onSelectCanvas(item);
        onClose();
      }}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
        <Layers size={20} color={colors.primary} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title || 'Untitled Canvas'}
        </Text>
        <Text style={[styles.itemSub, { color: colors.textTertiary }]}>
          {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Recent Canvases</Text>
          <View style={{ width: scale(36) }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: colors.error }}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={canvases}
            keyExtractor={item => item._id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textTertiary }]}>
                No canvases found
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: verticalScale(40) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(16),
    borderBottomWidth: 1,
  },
  closeBtn: { padding: moderateScale(4) },
  title: { fontSize: moderateScale(18), fontWeight: '700' },
  list: { paddingHorizontal: scale(16), paddingBottom: verticalScale(24) },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(12),
  },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: moderateScale(16), fontWeight: '500', marginBottom: verticalScale(2) },
  itemSub: { fontSize: moderateScale(12) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: verticalScale(40) },
});
