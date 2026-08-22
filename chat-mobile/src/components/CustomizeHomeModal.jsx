import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AccessibleModal from "./AccessibleModal";
import { useThemeStore } from "../stores/themeStore";
import { scale, verticalScale, moderateScale } from '../utils/responsive';

import {
  X,
  Layers,
  MessageSquare,
  Headphones,
  Bookmark,
  Send,
  GripVertical,
} from "lucide-react-native";

const QUICK_VIEW_ITEMS = [
  { key: "threads", label: "Threads", icon: MessageSquare },
  { key: "huddles", label: "Huddles", icon: Headphones },
  { key: "later", label: "Later", icon: Bookmark },
  { key: "drafts", label: "Drafts", icon: Send },
  { key: "scheduled", label: "Scheduled", icon: Send },
];

const CustomizeHomeModal = ({ visible, onClose, enabledCards, onToggleCard }) => {
  const { colors } = useThemeStore();

  return (
    <AccessibleModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              },
            ]}
          >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ width: scale(40) }} />
            <View style={styles.headerCenter}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Customize Home
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Drag to reorder quick views in Home
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={colors.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Items list */}
          <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
            {QUICK_VIEW_ITEMS.map((item) => {
              const Icon = item.icon;
              const isEnabled = enabledCards[item.key] !== false;
              return (
                <View
                  key={item.key}
                  style={[
                    styles.row,
                    {
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <GripVertical
                    size={18}
                    color={colors.textTertiary}
                    strokeWidth={1.5}
                  />
                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: colors.backgroundSecondary },
                    ]}
                  >
                    <Icon
                      size={18}
                      color={colors.primary}
                      strokeWidth={1.8}
                    />
                  </View>
                  <Text
                    style={[styles.rowLabel, { color: colors.textPrimary }]}
                  >
                    {item.label}
                  </Text>
                  <Switch
                    value={isEnabled}
                    onValueChange={() => onToggleCard(item.key)}
                    trackColor={{
                      false: colors.border,
                      true: colors.primary + "80",
                    }}
                    thumbColor={isEnabled ? colors.primary : colors.textTertiary}
                  />
                </View>
              );
            })}
          </ScrollView>

          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </AccessibleModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "75%",
    paddingTop: verticalScale(8),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(14),
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
  },
  title: {
    fontSize: moderateScale(18),
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: moderateScale(13),
    fontWeight: "500",
    marginTop: verticalScale(2),
  },
  closeBtn: {
    padding: moderateScale(4),
  },
  list: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(8),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: verticalScale(14),
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: scale(36),
    height: verticalScale(36),
    borderRadius: moderateScale(10),
    justifyContent: "center",
    alignItems: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: moderateScale(16),
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});

export default CustomizeHomeModal;
export { QUICK_VIEW_ITEMS };
