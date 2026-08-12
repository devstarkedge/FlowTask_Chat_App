import React, { memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import { File, Film, Image as ImageIcon, Music } from "lucide-react-native";
import { moderateScale, scale, verticalScale } from "../utils/responsive";
import { getReplyToSnippet, hasValidReplyTo, hasValidAttachment } from "../utils/replyUtils";

/**
 * Quoted original-message preview for Chat / Thread / Activity.
 * WhatsApp-style: accent bar + name + snippet/media. Tap scrolls to original.
 */
const ReplyQuotePreview = memo(function ReplyQuotePreview({
  replyTo,
  colors,
  onPress,
  variant = "bubble", // 'bubble' | 'thread' | 'activity'
  isMe = false,
  senderNameOverride = null,
}) {
  if (!hasValidReplyTo(replyTo)) return null;

  const rawName = (senderNameOverride || replyTo.senderName || "").trim();
  const senderName = rawName || "Someone";
  const snippet = getReplyToSnippet(replyTo);
  const attachment = hasValidAttachment(replyTo.attachment) ? replyTo.attachment : null;

  const type = String(attachment?.type || "").toLowerCase();
  const thumbUri =
    attachment?.thumbnailUrl ||
    (type.includes("gif") || type.includes("image") || type.includes("photo")
      ? attachment?.url
      : null) ||
    (type.includes("video") ? attachment?.thumbnailUrl : null);

  const showThumb = !!thumbUri;
  const mediaIcon = (() => {
    if (!attachment || showThumb) return null;
    if (type.includes("video")) return Film;
    if (type.includes("audio")) return Music;
    if (type.includes("image") || type.includes("photo") || type.includes("gif")) return ImageIcon;
    return File;
  })();
  const MediaIcon = mediaIcon;

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

  const body = (
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
          <View style={styles.thumbWrap}>
            <Image source={{ uri: thumbUri }} style={styles.thumb} resizeMode="cover" />
            {type.includes("video") ? (
              <View style={styles.videoBadge}>
                <Film size={10} color="#fff" />
              </View>
            ) : null}
          </View>
        ) : MediaIcon ? (
          <View
            style={[
              styles.thumbPlaceholder,
              { backgroundColor: colors.border || "rgba(0,0,0,0.08)" },
            ]}
          >
            <MediaIcon size={14} color={textColor} />
          </View>
        ) : null}
        <Text
          style={[
            styles.snippet,
            variant === "activity" && styles.activitySnippet,
            { color: textColor },
          ]}
          numberOfLines={2}
        >
          {snippet || (attachment ? inferFallback(attachment) : "Original message")}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return body;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      delayPressIn={0}
    >
      {body}
    </TouchableOpacity>
  );
});

function inferFallback(attachment) {
  const type = String(attachment?.type || "").toLowerCase();
  if (type.includes("gif")) return "GIF";
  if (type.includes("video")) return "Video";
  if (type.includes("audio")) return "Voice note";
  if (type.includes("image") || type.includes("photo")) return "Photo";
  return attachment?.name || "Attachment";
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
    borderRadius: moderateScale(8),
    paddingTop: verticalScale(6),
    paddingBottom: verticalScale(6),
    paddingLeft: scale(10),
    paddingRight: scale(10),
    marginBottom: verticalScale(8),
    minWidth: scale(140),
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
  thumbWrap: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(6),
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  videoBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    padding: 2,
  },
  thumbPlaceholder: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(6),
    alignItems: "center",
    justifyContent: "center",
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
