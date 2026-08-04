import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { scale, verticalScale, moderateScale } from "../utils/responsive";
import { AppAvatar } from "../components/common";
import { Hash, Lock, Radio, Plus, ChevronUp, ChevronDown, MoreVertical } from "lucide-react-native";

export const SkeletonCard = ({ colors }) => (
  <View style={[qcStyles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
    <View style={[{ width: '40%', aspectRatio: 1, borderRadius: moderateScale(10), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: '70%', height: moderateScale(10), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: '50%', height: moderateScale(8), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
  </View>
);

export const SkeletonRow = ({ colors }) => (
  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: moderateScale(16), paddingVertical: moderateScale(10), gap: 8, minHeight: moderateScale(44) }}>
    <View style={[{ width: moderateScale(16), height: moderateScale(16), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: '50%', height: moderateScale(14), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
  </View>
);

export const QuickCard = React.memo(({ icon: Icon, label, subtitle, onPress, colors }) => (
  <TouchableOpacity
    style={[qcStyles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.textPrimary }]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Icon size={22} color={colors.primary} strokeWidth={2} />
    <Text style={[qcStyles.label, { color: colors.textPrimary }]}>{label}</Text>
    <Text style={[qcStyles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
  </TouchableOpacity>
));

const qcStyles = StyleSheet.create({
  card: {
    minWidth: 100,
    maxWidth: 140,
    aspectRatio: 1.1,
    flexShrink: 0,
    borderRadius: moderateScale(16),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: moderateScale(6),
    paddingVertical: moderateScale(8),
    gap: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  label: { fontSize: moderateScale(12.5), fontWeight: "800", textAlign: "center", marginTop: 2 },
  subtitle: { fontSize: moderateScale(11), textAlign: "center", opacity: 0.8 },
});

export const SectionHeader = React.memo(({ title, icon: Icon, emojiIcon, sectionKey, isExpanded, onToggle, colors, onMenu, onAdd, hideChevron, indentLevel = 0 }) => {
  const paddingLeft = moderateScale(16) + (indentLevel * moderateScale(16));
  return (
  <View style={[shStyles.headerWrapper, { paddingLeft }]}>
    <TouchableOpacity 
      style={StyleSheet.absoluteFill} 
      onPress={() => onToggle && onToggle(sectionKey)} 
      disabled={!onToggle} 
      activeOpacity={0.7} 
    />
    <View style={shStyles.left} pointerEvents="none">
      {(Icon || emojiIcon) ? (
        <View style={shStyles.iconContainer}>
          {Icon ? <Icon size={20} color={colors.textSecondary} strokeWidth={2.5} /> : (
            <Text style={{ fontSize: moderateScale(18) }}>{emojiIcon}</Text>
          )}
        </View>
      ) : (
        <View style={shStyles.iconContainer} />
      )}
      <Text style={[shStyles.title, { color: colors.textSecondary }]} numberOfLines={1}>
        {title?.toUpperCase()}
      </Text>
    </View>

    <View style={shStyles.rightActions}>
      {onAdd && (
        <TouchableOpacity style={shStyles.iconBtn} onPress={onAdd}>
          <Plus size={24} color={colors.textSecondary} strokeWidth={2.5} />
        </TouchableOpacity>
      )}
      {onMenu && (
        <TouchableOpacity style={shStyles.iconBtn} onPress={onMenu}>
          <MoreVertical size={20} color={colors.textSecondary} strokeWidth={2.5} />
        </TouchableOpacity>
      )}
      {!hideChevron && (
        <View style={shStyles.iconBtn} pointerEvents="none">
          {isExpanded ? <ChevronUp size={24} color={colors.textTertiary} strokeWidth={2.5} /> : <ChevronDown size={24} color={colors.textTertiary} strokeWidth={2.5} />}
        </View>
      )}
    </View>
  </View>
);
});

const shStyles = StyleSheet.create({
  headerWrapper: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: moderateScale(6),
    paddingTop: moderateScale(12),
    paddingBottom: moderateScale(4),
    minHeight: moderateScale(48),
  },
  left: { 
    flex: 1,
    flexDirection: "row", 
    alignItems: "center", 
    gap: 12 
  },
  iconContainer: { 
    width: moderateScale(32), 
    height: moderateScale(32), 
    justifyContent: "center", 
    alignItems: "center" 
  },
  title: { 
    flex: 1,
    fontSize: moderateScale(12.5), 
    fontWeight: "800", 
    letterSpacing: 0.5 
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    width: moderateScale(44),
    height: moderateScale(44),
    justifyContent: "center",
    alignItems: "center",
  }
});

export const ChannelRow = React.memo(({ channel, unreadCount, onPress, onLongPress, colors, indentLevel = 0 }) => {
  const isPrivate = channel.visibility === "private";
  const isSystem = channel.type === "system";
  const Icon = isSystem ? Radio : isPrivate ? Lock : Hash;
  const paddingLeft = moderateScale(16) + (indentLevel * moderateScale(16));

  return (
    <TouchableOpacity 
      style={[chStyles.row, { paddingLeft }]} 
      onPress={() => onPress(channel)} 
      onLongPress={() => onLongPress && onLongPress(channel)}
      activeOpacity={0.5}
    >
      <View style={chStyles.iconContainer}>
        <Icon size={20} color={unreadCount > 0 ? colors.textPrimary : colors.textTertiary} strokeWidth={2} />
      </View>
      <Text
        style={[chStyles.name, { color: unreadCount > 0 ? colors.textPrimary : colors.textSecondary, fontWeight: unreadCount > 0 ? "700" : "400", flex: 1 }]}
        numberOfLines={1}
      >
        {channel.name}
      </Text>
      {unreadCount > 0 && (
        <View style={[chStyles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[chStyles.badgeText, { color: colors.textOnPrimary }]}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const chStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingRight: moderateScale(16), paddingVertical: moderateScale(12), gap: 12, minHeight: moderateScale(48) },
  iconContainer: { width: moderateScale(32), height: moderateScale(32), justifyContent: "center", alignItems: "center" },
  name: { fontSize: moderateScale(15.5) },
  badge: { minWidth: moderateScale(22), height: moderateScale(22), borderRadius: moderateScale(11), paddingHorizontal: moderateScale(6), justifyContent: "center", alignItems: "center" },
  badgeText: { fontSize: moderateScale(11), fontWeight: "800" },
});

export const AddChannelRow = ({ onPress, colors, label, indentLevel = 0 }) => {
  const paddingLeft = moderateScale(16) + (indentLevel * moderateScale(16));
  return (
  <TouchableOpacity style={[addStyles.row, { paddingLeft }]} onPress={onPress} activeOpacity={0.5}>
    <View style={addStyles.iconContainer}>
      <Plus size={20} color={colors.textTertiary} strokeWidth={2} />
    </View>
    <Text style={[addStyles.text, { color: colors.textTertiary }]}>{label || "Add channel"}</Text>
  </TouchableOpacity>
);
}

const addStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingRight: moderateScale(16), paddingVertical: moderateScale(12), gap: 12, minHeight: moderateScale(48) },
  iconContainer: { width: moderateScale(32), height: moderateScale(32), justifyContent: "center", alignItems: "center" },
  text: { fontSize: moderateScale(14) },
});

export const DMRow = React.memo(({ channel, unreadCount, onPress, colors, isSelf, indentLevel = 0 }) => {
  const dmUser = {
    _id: channel.dmRecipientId,
    name: channel.name,
    avatar: channel.avatar,
    onlineStatus: channel.onlineStatus || "offline",
  };

  const paddingLeft = moderateScale(16) + (indentLevel * moderateScale(16));

  return (
    <TouchableOpacity style={[dmStyles.row, { paddingLeft }]} onPress={() => onPress(channel)} activeOpacity={0.5}>
      <View style={dmStyles.iconContainer}>
        <AppAvatar user={dmUser} size={28} showStatus statusSize={8} />
      </View>
      <Text
        style={[dmStyles.name, { color: unreadCount > 0 ? colors.textPrimary : colors.textSecondary, fontWeight: unreadCount > 0 ? "700" : "400", flex: 1 }]}
        numberOfLines={1}
      >
        {isSelf ? "You" : channel.name}
      </Text>
      {unreadCount > 0 && (
        <View style={[dmStyles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[dmStyles.badgeText, { color: colors.textOnPrimary }]}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const dmStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingRight: moderateScale(16), paddingVertical: moderateScale(12), gap: 12, minHeight: moderateScale(48) },
  iconContainer: { width: moderateScale(32), height: moderateScale(32), justifyContent: "center", alignItems: "center" },
  name: { fontSize: moderateScale(15.5) },
  badge: { minWidth: moderateScale(22), height: moderateScale(22), borderRadius: moderateScale(11), paddingHorizontal: moderateScale(6), justifyContent: "center", alignItems: "center" },
  badgeText: { fontSize: moderateScale(11), fontWeight: "800" },
});
