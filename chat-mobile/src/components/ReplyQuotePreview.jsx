import React, { memo } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
} from "react-native";
import { moderateScale, scale, verticalScale } from "../utils/responsive";
import { getReplyToSnippet } from "../utils/replyUtils";

/**
 * Quoted original-message preview for Chat / Thread / Activity.
 * WhatsApp-style: accent bar + name + snippet. Tap scrolls to original.
 */
const ReplyQuotePreview = memo(function ReplyQuotePreview({
  replyTo,
  colors,
  onPress,
  variant = "bubble", // 'bubble' | 'thread' | 'activity'
  isMe = false,
  senderNameOverride = null,
}) {
  if (!replyTo) return null;

  const rawName = (senderNameOverride || replyTo.senderName || "").trim();
  const senderName = rawName || "Someone";
  const snippet = getReplyToSnippet(replyTo);

  const thumbUri =
    replyTo.attachment?.thumbnailUrl ||
    (["gif", "image", "video"].includes(replyTo.attachment?.type)
      ? replyTo.attachment?.url
      : null);

  // Show image/gif/video thumbs when available (alongside text is fine)
  const showThumb = !!thumbUri;

  const accent = colors.primary || "#6366F1";
  const nameColor = accent;
  const textColor = isMe
    ? colors.messageTextSent || colors.textPrimary
    : colors.textSecondary || colors.textPrimary;
  const bgColor =
    variant === "activity"
      ? colors.backgroundSecondary || "rgba(0,0,0,0.04)"
      : isMe
        ? "rgba(0,0,0,0.06)"
        : "rgba(0,0,0,0.05)";

  const content = (
    <View
      style={[
        styles.container,
        variant === "activity" && styles.activityContainer,
        variant === "thread" && styles.threadContainer,
        {
          borderLeftColor: accent,
          backgroundColor: bgColor,
        },
      ]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Replying to ${senderName}: ${snippet}`}
    >
      <Text style={[styles.senderName, { color: nameColor }]} numberOfLines={1}>
        {senderName}
      </Text>

      <View style={styles.bodyRow}>
        {showThumb ? (
          <Image source={{ uri: thumbUri }} style={styles.thumb} resizeMode="cover" />
        ) : null}
        <Text
          style={[
            styles.snippet,
            variant === "activity" && styles.activitySnippet,
            { color: textColor },
          ]}
          numberOfLines={2}
        >
          {snippet || "Message"}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
    borderRadius: moderateScale(8),
    paddingTop: verticalScale(6),
    paddingBottom: verticalScale(6),
    paddingLeft: scale(10),
    paddingRight: scale(10),
    marginBottom: verticalScale(8),
    minWidth: scale(120),
    alignSelf: "stretch",
  },
  activityContainer: {
    marginTop: verticalScale(4),
    marginBottom: verticalScale(4),
  },
  threadContainer: {
    marginTop: verticalScale(2),
    marginBottom: verticalScale(6),
  },
  senderName: {
    fontSize: moderateScale(13),
    fontWeight: "700",
    marginBottom: verticalScale(2),
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thumb: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(6),
  },
  snippet: {
    flex: 1,
    flexShrink: 1,
    fontSize: moderateScale(13),
    lineHeight: moderateScale(18),
  },
  activitySnippet: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(17),
  },
});

export default ReplyQuotePreview;
