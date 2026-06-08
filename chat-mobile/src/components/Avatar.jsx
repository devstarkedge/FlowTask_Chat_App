import React, { useState, useCallback } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useThemeStore } from "../stores/themeStore";

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

const getAvatarColor = (name) => {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
    const { colors } = useThemeStore();
    const [imgError, setImgError] = useState(false);
    const handleError = useCallback(() => setImgError(true), []);
    const data = user || member || {};

    const isOnline = data.onlineStatus === "online";
    const isAway = data.onlineStatus === "away";
    const isDnd =
      data.onlineStatus === "dnd" || data.chatPreferences?.dnd?.enabled;

    const avatarUrl = data.avatar || data.profileImage;
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
    const bgColor = getAvatarColor(displayName);
    const statusSize = Math.max(10, size * 0.3);

    return (
      <View style={[styles.container, style]}>
        {avatarUrl && !imgError ? (
          <Image
            source={{ uri: avatarUrl }}
            resizeMode="cover"
            style={[{ width: size, height: size, borderRadius: size * 0.2 }]}
            onError={handleError}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              {
                width: size,
                height: size,
                borderRadius: size * 0.2,
                backgroundColor: bgColor,
              },
            ]}
          >
            <Text
              style={[
                styles.initial,
                { fontSize: size * 0.4, color: "#FFFFFF" },
              ]}
            >
              {initials}
            </Text>
          </View>
        )}

        {showStatus && (isOnline || isAway || isDnd) && (
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
                    : colors.away,
                borderColor: colors.background,
                bottom: -2,
                right: -2,
              },
            ]}
          />
        )}

        {showCustomStatus && data.customStatus?.emoji && (
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
              {data.customStatus.emoji}
            </Text>
          </View>
        )}

        {showStatus && isDnd && (
          <View
            style={[
              styles.dndBadge,
              {
                minWidth: Math.max(14, size * 0.45),
                height: Math.max(14, size * 0.45),
                borderColor: colors.background,
                top: -4,
                right: -4,
              },
            ]}
          >
            <Text style={{ fontSize: Math.max(10, size * 0.35) }}>💤</Text>
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
    borderRadius: 999,
    backgroundColor: "transparent",
  },
  dndBadge: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 999,
    backgroundColor: "transparent",
  },
});

export default Avatar;
export { getAvatarColor };
