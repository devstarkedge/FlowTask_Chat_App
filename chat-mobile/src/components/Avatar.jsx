import React, { useState, useCallback, useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useShallow } from 'zustand/react/shallow';
import { useThemeStore } from "../stores/themeStore";
import { Moon } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { isCustomStatusValid } from '../utils/statusUtils';


const AVATAR_COLORS = [
  "#e91e63",
  "#9c27b0",
  "#673ab7",
  "#3f51b5",
  "#2196f3",
  "#009688",
  "#4caf50",
  "#ff9800",
  "#ff5722",
  "#795548",
];

const getAvatarColor = (name, palette) => {
  const colors = palette || AVATAR_COLORS;
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const Avatar = React.memo(
  ({
    user,
    member,
    size = 32,
    showStatus = false,
    showCustomStatus = false,
    style,
  }) => {
    const { colors } = useThemeStore(useShallow((s) => ({ colors: s.colors })));
    const [imgError, setImgError] = useState(false);
    const handleError = useCallback(() => setImgError(true), []);
    const data = user || member || {};

    const isOnline = data.onlineStatus === "online";
    const isAway = data.onlineStatus === "away";
    const isDnd =
      data.onlineStatus === "dnd" || 
      (data.chatPreferences?.dnd?.enabled && (!data.chatPreferences?.dnd?.pausedUntil || new Date(data.chatPreferences.dnd.pausedUntil).getTime() > Date.now())) ||
      (data.chatPreferences?.pausedUntil && new Date(data.chatPreferences.pausedUntil).getTime() > Date.now());

    // Backend uses 'avatar' primarily; also handle avatarUrl, profileImage, profilePicture, image
    const avatarUrl = useMemo(
      () => data.avatar || data.avatarUrl || data.profileImage || data.profilePicture || data.image || null,
      [data.avatar, data.avatarUrl, data.profileImage, data.profilePicture, data.image]
    );
    const displayName =
      data?.name ||
      data?.displayName ||
      data?.username ||
      (data?.email ? data.email.split("@")[0] : "") ||
      (typeof data === "string" ? data : "") ||
      "";

    // Derive a safe initial: prefer displayName first character, then _id, then fallback to 'U'
    const rawInitial =
      (displayName || "").toString().trim().charAt(0) ||
      (data?._id ? String(data._id).charAt(0) : "U");
    const initials = rawInitial.toUpperCase();
    const bgColor = getAvatarColor(displayName, colors.avatarColors);
    const statusSize = Math.max(10, size * 0.3);

    return (
      <View style={[styles.container, style]}>
        {avatarUrl && !imgError ? (
          <Image
            source={{ uri: avatarUrl }}
            resizeMode="cover"
            style={[{ width: size, height: size, borderRadius: size / 2 }]}
            onError={handleError}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: bgColor,
              },
            ]}
          >
            <Text
              style={[
                styles.initial,
                { fontSize: size * 0.4, color: colors.textOnPrimary },
              ]}
            >
              {initials}
            </Text>
          </View>
        )}

        {showStatus && (
          <View
            style={[
              styles.statusBadge,
              {
                width: statusSize,
                height: statusSize,
                borderRadius: statusSize / 2,
                backgroundColor: isOnline
                  ? colors.online
                  : isDnd
                    ? colors.busy
                    : isAway
                      ? colors.away
                      : colors.background,
                borderColor: isOnline || isDnd || isAway 
                  ? colors.background 
                  : colors.textTertiary,
                borderWidth: 2,
                bottom: -2,
                right: -2,
              },
            ]}
          />
        )}

        {showCustomStatus && isCustomStatusValid(data.customStatus) && (
          <View
            style={[
              styles.customStatus,
              {
                minWidth: Math.max(14, size * 0.45),
                height: Math.max(14, size * 0.45),
                borderColor: colors.background,
                bottom: -4,
                left: -4,
              },
            ]}
          >
            <Text style={{ fontSize: Math.max(10, size * 0.35) }}>
              {data.customStatus.emoji || '💬'}
            </Text>
          </View>
        )}

                                        {showStatus && isDnd && (
          <View
            style={[
              styles.dndBadge,
              {
                width: statusSize,
                height: statusSize,
                borderRadius: statusSize / 2,
                backgroundColor: colors.busy,
                borderColor: colors.background,
                borderWidth: 2,
                top: -2,
                right: -2,
              },
            ]}
          >
            <Moon
              size={Math.max(8, size * 0.22)}
              color={colors.textOnPrimary}
              strokeWidth={2.5}
            />
          </View>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  fallback: {
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    fontWeight: "700",
  },
  statusBadge: {
    position: "absolute",
    borderWidth: 2,
  },
  customStatus: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: moderateScale(999),
    backgroundColor: "transparent",
  },
      dndBadge: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
});

export default Avatar;
export { getAvatarColor };
