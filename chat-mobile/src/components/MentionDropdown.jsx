/**
 * MentionDropdown — Popup Modal showing workspace/channel members
 * filtered by @mention query. Renders in a dedicated modal overlay to
 * ensure it is never cut off or clipped when the message composer is expanded.
 *
 * Props:
 *   visible  – boolean (whether the popup modal is open)
 *   members  – array of member objects { _id, name, email, avatar }
 *   query    – current text after @ trigger
 *   onSelect – (member) => void
 *   onClose  – () => void
 *   colors   – theme colors
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import KeyboardAwareContainer from './common/KeyboardAwareContainer';
import { AppAvatar } from './common';
import { AtSign, Search, X } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';

const MentionDropdown = React.memo(function MentionDropdown({
  visible = false,
  members = [],
  query = '',
  onSelect,
  onClose,
  colors,
}) {
  const { isTablet, isDesktop } = useResponsive();
  const [searchQuery, setSearchQuery] = useState(query);

  // Sync internal search query when prop query changes from editor typing
  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  const filteredMembers = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.username || '').toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <KeyboardAwareContainer
            disablePadding={false}
            style={[styles.keyboardContainer, { backgroundColor: 'transparent' }]}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={[
                  styles.modalCard,
                  {
                    backgroundColor: colors.card || colors.background,
                    borderColor: colors.border,
                  },
                  isTablet || isDesktop ? styles.wideCard : null,
                ]}
              >
                {/* Modal Header */}
                <View style={[styles.header, { borderBottomColor: colors.border }]}>
                  <View style={styles.headerTitleRow}>
                    <View style={[styles.atIconCircle, { backgroundColor: colors.primary + '15' }]}>
                      <AtSign size={16} color={colors.primary} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                      Mention Member
                    </Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                    <X size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Search Bar */}
                <View style={[styles.searchBar, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
                  <Search size={16} color={colors.inputPlaceholder} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.inputText }]}
                    placeholder="Search member by name or email..."
                    placeholderTextColor={colors.inputPlaceholder}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <X size={14} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Member List */}
                <FlatList
                  data={filteredMembers}
                  keyExtractor={(item) => item._id || item.id || String(Math.random())}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.memberRow, { borderBottomColor: colors.borderLight || colors.border }]}
                      onPress={() => onSelect(item)}
                      activeOpacity={0.7}
                    >
                      <AppAvatar user={item} size={34} showStatus={false} />
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {item.name || 'Unknown User'}
                        </Text>
                        {item.email ? (
                          <Text style={[styles.memberEmail, { color: colors.textTertiary }]} numberOfLines={1}>
                            {item.email}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.mentionBadge, { backgroundColor: colors.primary + '15' }]}>
                        <Text style={[styles.mentionBadgeText, { color: colors.primary }]}>Select</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        {searchQuery ? `No members found matching "${searchQuery}"` : 'No channel members available'}
                      </Text>
                    </View>
                  }
                  showsVerticalScrollIndicator={true}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                />
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAwareContainer>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(16),
  },
  keyboardContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: scale(480),
    maxHeight: verticalScale(420),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
  wideCard: {
    maxWidth: scale(560),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  atIconCircle: {
    width: scale(28),
    height: scale(28),
    borderRadius: moderateScale(14),
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  closeBtn: {
    padding: moderateScale(4),
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: scale(16),
    marginTop: verticalScale(12),
    marginBottom: verticalScale(8),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(14),
    padding: 0,
  },
  list: {
    maxHeight: verticalScale(280),
  },
  listContent: {
    paddingBottom: verticalScale(12),
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  memberEmail: {
    fontSize: moderateScale(12),
    marginTop: verticalScale(1),
  },
  mentionBadge: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(12),
  },
  mentionBadgeText: {
    fontSize: moderateScale(12),
    fontWeight: '700',
  },
  emptyContainer: {
    padding: moderateScale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: moderateScale(14),
    textAlign: 'center',
  },
});

export default MentionDropdown;
