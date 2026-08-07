import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { FileText, Bookmark, MoreVertical, Calendar, Users } from 'lucide-react-native';
import { AppAvatar } from '../common';
import { useThemeStore } from '../../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';


// Canvas type display config
const CANVAS_TYPE_CONFIG = {
  notes: { label: 'Notes', color: '#3b82f6' },
  meeting: { label: 'Meeting', color: '#8b5cf6' },
  brainstorm: { label: 'Brainstorm', color: '#f59e0b' },
  template: { label: 'Template', color: '#6366f1' },
  project: { label: 'Project', color: '#10b981' },
  incident: { label: 'Incident', color: '#ef4444' },
  knowledge: { label: 'Knowledge', color: '#0ea5e9' },
};

/**
 * Extract readable plain text from a TipTap JSON doc for preview.
 */
function extractTextFromContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content !== 'object') return '';

  const texts = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && node.text) {
      texts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  };

  if (content.type === 'doc' && Array.isArray(content.content)) {
    content.content.forEach(walk);
  } else if (Array.isArray(content)) {
    content.forEach(walk);
  }

  return texts.join(' ').trim();
}

export default function CanvasCard({ canvas, isSaved, onSelect, onSaveToggle, onOptionsPress }) {
  const { colors } = useThemeStore();

  const formattedDate = React.useMemo(() => {
    if (!canvas?.updatedAt) return '';
    const date = new Date(canvas.updatedAt);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [canvas?.updatedAt]);

  // Server populates `createdBy` (not `creatorId`) with { _id, name, avatar }
  const creatorObj = React.useMemo(() => {
    // Check populated createdBy first (server response)
    if (typeof canvas?.createdBy === 'object' && canvas?.createdBy !== null) {
      return canvas.createdBy;
    }
    // Fallback: check legacy creatorId field
    if (typeof canvas?.creatorId === 'object' && canvas?.creatorId !== null) {
      return canvas.creatorId;
    }
    return {
      _id: canvas?.createdBy || canvas?.creatorId,
      name: canvas?.creatorName || 'Member',
      avatar: canvas?.creatorAvatar || null,
    };
  }, [canvas]);

  // Last edited by info
  const lastEditorObj = React.useMemo(() => {
    if (typeof canvas?.lastEditedBy === 'object' && canvas?.lastEditedBy !== null) {
      return canvas.lastEditedBy;
    }
    if (typeof canvas?.updatedBy === 'object' && canvas?.updatedBy !== null) {
      return canvas.updatedBy;
    }
    return null;
  }, [canvas]);

  // Extract text preview from canvas content
  const previewText = React.useMemo(() => {
    if (canvas?.summary) return canvas.summary;
    const extracted = extractTextFromContent(canvas?.content);
    return extracted || 'No description available';
  }, [canvas?.summary, canvas?.content]);

  const hasCover = !!canvas?.cover;
  const coverType = canvas?.cover?.type; // 'color', 'gradient', or 'image'
  const coverValue = canvas?.cover?.value;

  const typeConfig = CANVAS_TYPE_CONFIG[canvas?.type] || CANVAS_TYPE_CONFIG.notes;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onSelect(canvas)}
      activeOpacity={0.7}
    >
      {/* Cover Header */}
      {hasCover && coverType === 'image' && (
        <View style={styles.coverFrame}>
          <Image source={{ uri: coverValue }} style={styles.coverImage} />
        </View>
      )}
      {hasCover && coverType === 'gradient' && (
        <View style={[styles.coverFrame, { backgroundColor: coverValue }]} />
      )}
      {hasCover && coverType === 'color' && (
        <View style={[styles.coverFrame, { backgroundColor: coverValue }]} />
      )}

      <View style={styles.cardBody}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
            <FileText size={20} color={colors.primary} />
          </View>
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {canvas?.title || 'Untitled Canvas'}
            </Text>
            {canvas?.type && (
              <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
                <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
                  {typeConfig.label}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onSaveToggle(canvas._id);
              }}
              style={styles.actionBtn}
            >
              {isSaved ? (
                <Bookmark size={18} color="#eab308" fill="#eab308" />
              ) : (
                <Bookmark size={18} color={colors.textTertiary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onOptionsPress(canvas);
              }}
              style={styles.actionBtn}
            >
              <MoreVertical size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={2}>
          {previewText}
        </Text>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={styles.userInfo}>
            <AppAvatar user={creatorObj} size={22} showStatus={false} />
            <Text style={[styles.author, { color: colors.textSecondary }]} numberOfLines={1}>
              {creatorObj.name}
            </Text>
          </View>
          {lastEditorObj && lastEditorObj._id !== creatorObj._id && (
            <View style={styles.editorInfo}>
              <Users size={12} color={colors.textTertiary} />
              <Text style={[styles.editorText, { color: colors.textTertiary }]} numberOfLines={1}>
                {lastEditorObj.name}
              </Text>
            </View>
          )}
          <View style={styles.timeInfo}>
            <Calendar size={12} color={colors.textTertiary} style={styles.timeIcon} />
            <Text style={[styles.timeText, { color: colors.textTertiary }]}>{formattedDate}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: scale(0), height: verticalScale(2) },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  coverFrame: {
    width: '100%',
    height: verticalScale(70),
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardBody: {
    padding: moderateScale(16),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  iconContainer: {
    width: scale(32),
    height: verticalScale(32),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(10),
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(4),
    marginTop: verticalScale(3),
  },
  typeBadgeText: {
    fontSize: moderateScale(10),
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: moderateScale(6),
    marginLeft: scale(4),
  },
  preview: {
    fontSize: moderateScale(14),
    lineHeight: 20,
    marginBottom: verticalScale(14),
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: verticalScale(10),
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: scale(12),
    gap: 6,
  },
  author: {
    fontSize: moderateScale(12),
  },
  editorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: scale(8),
    gap: 3,
  },
  editorText: {
    fontSize: moderateScale(11),
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeIcon: {
    marginRight: scale(4),
  },
  timeText: {
    fontSize: moderateScale(11),
  },
});
