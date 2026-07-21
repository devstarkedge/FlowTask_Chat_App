import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { scale, verticalScale, moderateScale } from "../utils/responsive";
import { AppAvatar } from "../components/common";
import { Hash, Lock, Volume2, Plus, ChevronUp, ChevronDown, MoreVertical } from "lucide-react-native";

export const SkeletonCard = ({ colors }) => (
  <View style={[qcStyles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
    <View style={[{ width: scale(20), height: verticalScale(20), borderRadius: moderateScale(10), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: scale(50), height: verticalScale(10), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: scale(30), height: verticalScale(8), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
  </View>
);

export const SkeletonRow = ({ colors }) => (
  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: scale(16), paddingVertical: verticalScale(6), gap: 8, minHeight: verticalScale(36) }}>
    <View style={[{ width: scale(16), height: verticalScale(16), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
    <View style={[{ width: scale(120), height: verticalScale(14), borderRadius: moderateScale(4), opacity: 0.5, backgroundColor: colors.border }]} />
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
    width: scale(95),
    height: scale(85),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scale(6),
    gap: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  label: { fontSize: moderateScale(12.5), fontWeight: "800", textAlign: "center", marginTop: 2 },
  subtitle: { fontSize: moderateScale(11), textAlign: "center", opacity: 0.8 },
});

export const SectionHeader = React.memo(({ title, icon: Icon, sectionKey, isExpanded, onToggle, colors, onMenu, onAdd }) => (
  <View style={shStyles.headerWrapper}>
    <TouchableOpacity style={shStyles.headerLeft} onPress={() => onToggle(sectionKey)} activeOpacity={0.7}>
      <View style={shStyles.left}>
        {Icon && <Icon size={14} color={colors.textSecondary} strokeWidth={2.5} />}
        <Text style={[shStyles.title, { color: colors.textSecondary }]}>{title?.toUpperCase()}</Text>
      </View>
      {isExpanded ? <ChevronUp size={16} color={colors.textTertiary} strokeWidth={2.5} /> : <ChevronDown size={16} color={colors.textTertiary} strokeWidth={2.5} />}
    </TouchableOpacity>

    {(onMenu || onAdd) && (
      <View style={shStyles.headerRight}>
        {onAdd && (
          <TouchableOpacity style={shStyles.iconBtn} onPress={onAdd}>
            <Plus size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {onMenu && (
          <TouchableOpacity style={shStyles.iconBtn} onPress={onMenu}>
            <MoreVertical size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    )}
  </View>
));

const shStyles = StyleSheet.create({
  headerWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(6),
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "space-between",
  },
  left: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: moderateScale(12.5), fontWeight: "800", letterSpacing: 0.5 },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: scale(8),
  },
  iconBtn: {
    padding: scale(4),
  }
});

export const ChannelRow = React.memo(({ channel, unreadCount, onPress, onLongPress, colors }) => {
  const isPrivate = channel.visibility === "private";
  const isSystem = channel.type === "system";
  const Icon = isSystem ? Volume2 : isPrivate ? Lock : Hash;

  return (
    <TouchableOpacity 
      style={chStyles.row} 
      onPress={() => onPress(channel)} 
      onLongPress={() => onLongPress && onLongPress(channel)}
      activeOpacity={0.5}
    >
      <Icon size={16} color={unreadCount > 0 ? colors.textPrimary : colors.textTertiary} strokeWidth={1.5} />
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
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: scale(16), paddingVertical: verticalScale(10), gap: 10, minHeight: verticalScale(44) },
  name: { fontSize: moderateScale(15.5) },
  badge: { minWidth: scale(22), height: scale(22), borderRadius: moderateScale(11), paddingHorizontal: scale(6), justifyContent: "center", alignItems: "center" },
  badgeText: { fontSize: moderateScale(11), fontWeight: "800" },
});

export const AddChannelRow = ({ onPress, colors, label }) => (
  <TouchableOpacity style={addStyles.row} onPress={onPress} activeOpacity={0.5}>
    <Plus size={16} color={colors.textTertiary} strokeWidth={1.5} />
    <Text style={[addStyles.text, { color: colors.textTertiary }]}>{label || "Add channel"}</Text>
  </TouchableOpacity>
);

const addStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: scale(16), paddingVertical: verticalScale(8), gap: 8 },
  text: { fontSize: moderateScale(14) },
});

export const DMRow = React.memo(({ channel, unreadCount, onPress, colors, isSelf }) => {
  const dmUser = {
    _id: channel.dmRecipientId,
    name: channel.name,
    avatar: channel.avatar,
    onlineStatus: channel.onlineStatus || "offline",
  };

  return (
    <TouchableOpacity style={dmStyles.row} onPress={() => onPress(channel)} activeOpacity={0.5}>
      <AppAvatar user={dmUser} size={28} showStatus statusSize={8} />
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
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: scale(16), paddingVertical: verticalScale(10), gap: 10, minHeight: verticalScale(48) },
  name: { fontSize: moderateScale(15.5) },
  badge: { minWidth: scale(22), height: scale(22), borderRadius: moderateScale(11), paddingHorizontal: scale(6), justifyContent: "center", alignItems: "center" },
  badgeText: { fontSize: moderateScale(11), fontWeight: "800" },
});
