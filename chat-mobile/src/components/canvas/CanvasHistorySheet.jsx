import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RotateCcw, X, Clock } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


export default function CanvasHistorySheet({ visible, onClose, history = [], onRestore }) {
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [500, 0],
  });

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              transform: [{ translateY }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.safeArea, { paddingBottom: Math.max(moderateScale(16), insets.bottom) }]}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Version History</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {history.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Clock size={40} color="#9ca3af" />
                <Text style={styles.emptyText}>No history versions recorded yet.</Text>
              </View>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item._id}
                style={styles.list}
                renderItem={({ item }) => (
                  <View style={styles.historyRow}>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyUser}>
                        {item.editorId?.name || 'Collaborator'}
                      </Text>
                      <Text style={styles.historyTime}>
                        {formatTime(item.timestamp)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.restoreBtn}
                      onPress={() => {
                        onRestore(item._id);
                        onClose();
                      }}
                      activeOpacity={0.7}
                    >
                      <RotateCcw size={16} color="#4f46e5" style={styles.restoreIcon} />
                      <Text style={styles.restoreText}>Restore</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    shadowColor: '#000000',
    shadowOffset: { width: scale(0), height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  safeArea: {
    paddingBottom: Platform.OS === 'android' ? 16 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(16),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    color: '#1f2937',
  },
  closeBtn: {
    padding: moderateScale(4),
  },
  list: {
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(8),
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  historyInfo: {
    flex: 1,
    marginRight: scale(16),
  },
  historyUser: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#1f2937',
  },
  historyTime: {
    fontSize: moderateScale(12),
    color: '#6b7280',
    marginTop: verticalScale(2),
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(6),
  },
  restoreIcon: {
    marginRight: scale(4),
  },
  restoreText: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#4f46e5',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(40),
  },
  emptyText: {
    fontSize: moderateScale(14),
    color: '#6b7280',
    marginTop: verticalScale(12),
  },
});
