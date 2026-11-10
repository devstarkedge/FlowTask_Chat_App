import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GripVertical, X } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import {
  buildCategoryOrdersFromList,
  sortCategoriesByOrder,
} from '../utils/categoryOrder';
import DraggableOrderList from './DraggableOrderList';
import { moderateScale, scale, verticalScale } from '../utils/responsive';

/**
 * ReorderCategoriesModal — Allows drag-and-drop reordering of all categories
 * (FlowTask departments and custom categories) on mobile, syncing to desktop/web.
 */
export default function ReorderCategoriesModal({ visible, onClose }) {
  const { colors } = useThemeStore();
  const { width: screenWidth } = useWindowDimensions();
  const SHEET_MAX_WIDTH = 480;
  const isWide = screenWidth > SHEET_MAX_WIDTH;

  const categories = useChannelStore((s) => s.categories) || [];
  const reorderCategories = useChannelStore((s) => s.reorderCategories);

  const [orderedList, setOrderedList] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsDragging(false);
      return;
    }
    setOrderedList(sortCategoriesByOrder(categories));
  }, [visible, categories]);

  const handleReorder = async (nextList) => {
    setOrderedList(nextList);
    const categoryOrders = buildCategoryOrdersFromList(nextList);
    if (categoryOrders.length === 0) return;
    try {
      await reorderCategories(categoryOrders);
      Toast.show({ type: 'success', text1: 'Category order updated' });
    } catch {
      setOrderedList(sortCategoriesByOrder(useChannelStore.getState().categories));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={styles.overlay}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
          <SafeAreaView
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                width: isWide ? SHEET_MAX_WIDTH : '100%',
                alignSelf: isWide ? 'center' : 'stretch',
                borderTopLeftRadius: isWide ? moderateScale(12) : moderateScale(16),
                borderTopRightRadius: isWide ? moderateScale(12) : moderateScale(16),
              },
            ]}
            edges={['bottom']}
          >
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Reorder Categories
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Drag handles to arrange how categories appear in your sidebar
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={8}
                style={[styles.closeBtn, { backgroundColor: colors.backgroundSecondary }]}
              >
                <X size={18} color={colors.textSecondary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <ScrollView
              scrollEnabled={!isDragging}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
            >
              {orderedList.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No categories to reorder yet.
                </Text>
              ) : (
                <DraggableOrderList
                  items={orderedList}
                  keyExtractor={(item) => String(item._id)}
                  onDragActiveChange={setIsDragging}
                  onReorder={handleReorder}
                  renderItem={({ item, isDragging: rowDragging, dragHandleProps }) => {
                    const isDept = item.type === 'department';
                    return (
                      <View
                        style={[
                          styles.card,
                          {
                            borderColor: rowDragging ? colors.primary : colors.border,
                            backgroundColor: rowDragging
                              ? colors.background
                              : colors.backgroundSecondary,
                          },
                        ]}
                      >
                        <View
                          {...dragHandleProps}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 12 }}
                          style={styles.dragHandle}
                        >
                          <GripVertical
                            size={18}
                            color={rowDragging ? colors.primary : colors.textTertiary}
                          />
                        </View>
                        <Text style={styles.emoji}>{item.icon || '📁'}</Text>
                        <Text
                          style={[styles.name, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: isDept
                                ? `${colors.primary}18`
                                : colors.background,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              { color: isDept ? colors.primary : colors.textSecondary },
                            ]}
                          >
                            {isDept ? 'Department' : 'Custom'}
                          </Text>
                        </View>
                      </View>
                    );
                  }}
                />
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    maxHeight: '82%',
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(16),
    borderBottomWidth: 1,
    gap: scale(12),
  },
  title: {
    fontSize: moderateScale(17),
    fontWeight: '700',
  },
  subtitle: {
    fontSize: moderateScale(12.5),
    marginTop: 2,
  },
  closeBtn: {
    padding: scale(6),
    borderRadius: moderateScale(6),
  },
  body: {
    padding: scale(18),
    paddingBottom: verticalScale(28),
  },
  emptyText: {
    textAlign: 'center',
    fontSize: moderateScale(14),
    paddingVertical: verticalScale(24),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: moderateScale(10),
    paddingRight: scale(12),
    paddingVertical: verticalScale(12),
    marginBottom: verticalScale(10),
    gap: scale(10),
  },
  dragHandle: {
    paddingLeft: scale(12),
    paddingRight: scale(4),
    paddingVertical: verticalScale(4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: moderateScale(17),
  },
  name: {
    flex: 1,
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  badge: {
    borderWidth: 1,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
  },
  badgeText: {
    fontSize: moderateScale(11),
    fontWeight: '600',
  },
});
