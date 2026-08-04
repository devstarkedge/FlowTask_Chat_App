import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import KeyboardAwareContainer from './common/KeyboardAwareContainer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { categoryAPI, directoriesAPI } from '../services/api';
import {
  X,
  Check,
  ChevronDown,
  FolderPlus,
  Search,
  Hash,
  Lock,
  Volume2,
} from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

// ─── Department sync singleton ────────────────────────────────────────────────
let _deptSyncInFlight = null;
function syncDepartmentsSingleton() {
  if (_deptSyncInFlight) return _deptSyncInFlight;
  const req = categoryAPI.syncDepartments();
  _deptSyncInFlight = req;
  const clear = () => { if (_deptSyncInFlight === req) _deptSyncInFlight = null; };
  req.then(clear, clear);
  return req;
}

// ─── Channel icon helper ──────────────────────────────────────────────────────
const ChannelIcon = ({ channel, color, size = 14 }) => {
  if (channel.visibility === 'private' || channel.type === 'private')
    return <Lock size={size} color={color} />;
  if (channel.type === 'system')
    return <Volume2 size={size} color={color} />;
  return <Hash size={size} color={color} />;
};

// ─── Selected Channel Chip ────────────────────────────────────────────────────
const Chip = ({ channel, onRemove, colors }) => (
  <View style={[styles.chip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
    <ChannelIcon channel={channel} color={colors.textSecondary} size={12} />
    <Text style={[styles.chipName, { color: colors.textPrimary }]} numberOfLines={1}>
      {channel.name}
    </Text>
    <TouchableOpacity onPress={() => onRemove(channel._id)} hitSlop={6}>
      <X size={11} color={colors.textSecondary} />
    </TouchableOpacity>
  </View>
);

// ─── EMOJI cycle list ─────────────────────────────────────────────────────────
const EMOJI_LIST = ['✨', '📁', '🎯', '🚀', '💡', '📌', '🔖', '🗂️', '📊', '🎨', '🏆', '💼'];

export default function CreateCategoryModal({ visible, onClose }) {
  const { colors } = useThemeStore();
  const { width: screenWidth } = useWindowDimensions();
  const SHEET_MAX_WIDTH = 480;
  const isWide = screenWidth > SHEET_MAX_WIDTH;
  const { channels, categories, fetchCategories, fetchChannels, isLoading: channelsLoading } = useChannelStore();

  // ── State ──
  const [categoryType, setCategoryType] = useState('department');
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptError, setDeptError] = useState(null);
  const [expandedDepts, setExpandedDepts] = useState({});
  const deptSeq = useRef(0);
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState('✨');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannels, setSelectedChannels] = useState([]);
  const chRefreshed = useRef(false);

  // ── Derived data ──
  const existingDeptIds = useMemo(() => new Set(
    categories
      .filter(c => c.type === 'department')
      .flatMap(c => [c.departmentId?._id, c.departmentId?.externalId, c.departmentId])
      .filter(id => typeof id === 'string')
      .map(String),
  ), [categories]);

  const hasDeptCategory = existingDeptIds.size > 0;

  const getDeptChannels = useCallback((dept) => {
    const tid = String(dept.externalId || dept._id);
    return channels.filter(c => {
      if (c.isArchived) return false;
      const fid = String(c.flowTaskRef?.entityId?._id || c.flowTaskRef?.entityId);
      const isDept = c.flowTaskRef?.entityType === 'department' && fid === tid;
      const cDept = String(c.departmentRef?.departmentId?._id || c.departmentRef?.departmentId);
      const isProj = !!c.departmentRef?.departmentId && cDept === tid;
      return isDept || isProj;
    });
  }, [channels]);

  const missingDepts = useMemo(() =>
    departments.filter(d => {
      const isMissing = !existingDeptIds.has(String(d._id)) && !existingDeptIds.has(String(d.externalId));
      if (!isMissing) return false;
      return getDeptChannels(d).length > 0;
    }),
    [departments, existingDeptIds, getDeptChannels],
  );

  const allImported = !loadingDepts && departments.length > 0 && missingDepts.length === 0;
  const hideDeptAction = categoryType === 'department' && allImported;

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return channels
      .filter(c => c.type !== 'dm' && c.type !== 'self' && !c.isArchived)
      .filter(c => (!q || c.name?.toLowerCase().includes(q)) && !selectedChannels.some(s => s._id === c._id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 50);
  }, [searchQuery, channels, selectedChannels]);

  const isFormValid = () => {
    if (categoryType === 'department') return missingDepts.length > 0 && !loadingDepts;
    if (categoryType === 'custom') return customName.trim().length > 0;
    if (categoryType === 'none') return categories.length > 0;
    return false;
  };

  // ── Effects ──
  const loadDepartments = useCallback(async () => {
    const seq = ++deptSeq.current;
    setLoadingDepts(true);
    setDeptError(null);
    try {
      const response = await syncDepartmentsSingleton();
      if (seq !== deptSeq.current) return;
      const list = response?.data?.data || response?.data || [];
      setDepartments(Array.isArray(list) ? list : []);
    } catch (syncErr) {
      try {
        const fallbackResponse = await categoryAPI.getDepartments();
        if (seq !== deptSeq.current) return;
        const cached = fallbackResponse?.data?.data || fallbackResponse?.data || [];
        setDepartments(Array.isArray(cached) ? cached : []);
        if (cached.length === 0) {
          setDeptError(syncErr.response?.data?.error?.message
            || 'Unable to synchronize departments from FlowTask.');
        }
      } catch {
        if (seq !== deptSeq.current) return;
        setDepartments([]);
        setDeptError('Unable to load departments. Check your FlowTask session and try again.');
      }
    } finally {
      if (seq === deptSeq.current) setLoadingDepts(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      // Reset form on open
      const hasDeptCategoryType = categories.some(c => c.type === 'department');
      const hasCustomCategoryType = categories.some(c => c.type === 'custom');
      if (hasDeptCategoryType) setCategoryType('department');
      else if (hasCustomCategoryType) setCategoryType('custom');
      else setCategoryType('department');

      setCustomName('');
      setCustomIcon('✨');
      setSearchQuery('');
      setSelectedChannels([]);
      setExpandedDepts({});
      setDeptError(null);
      loadDepartments();
      if (!chRefreshed.current) {
        chRefreshed.current = true;
        fetchChannels().catch(() => {});
      }
    }
    return () => { deptSeq.current += 1; };
  }, [visible, loadDepartments, fetchChannels, categories]);

  // ── Handlers ──
  const toggleChannel = (ch) => {
    if (selectedChannels.some(s => s._id === ch._id)) {
      setSelectedChannels(p => p.filter(s => s._id !== ch._id));
    } else {
      setSelectedChannels(p => [...p, ch]);
      setSearchQuery('');
    }
  };

  const removeChannel = (id) => {
    setSelectedChannels(p => p.filter(s => s._id !== id));
  };

  const handleSubmit = async () => {
    if (!isFormValid()) return;
    setIsSubmitting(true);
    try {
      let msg = '';

      if (categoryType === 'none') {
        const { data } = await categoryAPI.clearAll();
        msg = data?.message || 'Categories removed. Channels are now shown normally.';
      } else if (categoryType === 'department') {
        if (missingDepts.length === 0) {
          Alert.alert('Info', 'All departments are already imported.');
          setIsSubmitting(false);
          onClose();
          return;
        }

        const results = await Promise.allSettled(
          missingDepts.map(dept => {
            let catName = dept.name;
            let n = 1;
            while (categories.some(c => c.name.toLowerCase() === catName.toLowerCase())) {
              catName = n === 1 ? `${dept.name} (Department)` : `${dept.name} (Department ${n})`;
              n++;
            }
            return categoryAPI.create({
              name: catName,
              type: 'department',
              departmentId: dept._id,
              icon: dept.icon || '📁',
            });
          }),
        );

        const ok = results.filter(r => r.status === 'fulfilled').length;
        if (ok === 0) throw new Error('Failed to import departments');
        msg = `Imported ${ok} department${ok === 1 ? '' : 's'} successfully`;
      } else {
        const res = await categoryAPI.create({
          name: customName.trim(),
          type: 'custom',
          departmentId: null,
          icon: customIcon,
        });
        const newCat = res.data?.data;
        if (selectedChannels.length > 0 && newCat?._id) {
          await categoryAPI.addBulkChannels(newCat._id, selectedChannels.map(c => c._id));
        }
        msg = `Category "${customName.trim()}" created`;
      }

      Alert.alert('Success', msg);
      if (categoryType === 'none') {
        await Promise.all([fetchCategories(), fetchChannels()]);
      } else {
        await fetchCategories();
      }
      onClose();
    } catch (err) {
      Alert.alert('Error',
        err.response?.data?.error?.message
        || err.response?.data?.message
        || (categoryType === 'none' ? 'Failed to update category view' : 'Failed to create category'),
      );
    }
    setIsSubmitting(false);
  };

  const submitLabel = isSubmitting
    ? (categoryType === 'department' ? 'Importing…' : categoryType === 'none' ? 'Updating…' : 'Creating…')
    : (categoryType === 'department'
      ? `Import ${missingDepts.length} Department${missingDepts.length === 1 ? '' : 's'}`
      : categoryType === 'none' ? 'Update' : 'Create Category');

  // ── Render ──
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAwareContainer style={styles.overlay} disablePadding={false}>
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
              maxHeight: isWide ? '80%' : '90%',
            },
          ]}
          edges={['bottom']}
        >
          {/* ──────────── Header ──────────── */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerIcon}>
              <FolderPlus size={24} color={colors.primary} strokeWidth={2} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Create Category</Text>
              <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                Organize your channels into structured categories
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8} aria-label="Close modal">
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ──────────── Type Selector ──────────── */}
          <View style={[styles.typeSection, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={styles.radioRow}
              onPress={() => setCategoryType('department')}
              activeOpacity={0.7}
            >
              <View style={[styles.radioOuter, { borderColor: categoryType === 'department' ? colors.primary : colors.border }]}>
                {categoryType === 'department' && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
              <Text style={[styles.radioLabel, { color: colors.textPrimary }]}>Department</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.radioRow}
              onPress={() => setCategoryType('custom')}
              activeOpacity={0.7}
            >
              <View style={[styles.radioOuter, { borderColor: categoryType === 'custom' ? colors.primary : colors.border }]}>
                {categoryType === 'custom' && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
              </View>
              <Text style={[styles.radioLabel, { color: colors.textPrimary }]}>Custom Category</Text>
            </TouchableOpacity>

            {hasDeptCategory && (
              <TouchableOpacity
                style={styles.radioRow}
                onPress={() => setCategoryType('none')}
                activeOpacity={0.7}
              >
                <View style={[styles.radioOuter, { borderColor: categoryType === 'none' ? colors.primary : colors.border }]}>
                  {categoryType === 'none' && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.radioLabel, { color: colors.textPrimary }]}>No Category</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ──────────── Body ──────────── */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyPad}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ===== Department ===== */}
            {categoryType === 'department' && (
              <View style={styles.fieldGroup}>
                {/* Info banner */}
                <View style={[styles.infoBanner, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Text style={[styles.infoBannerText, { color: colors.textSecondary }]}>
                    {allImported
                      ? 'All FlowTask departments are already available in your Categories.'
                      : (
                        <>
                          Departments are synchronized automatically from FlowTask. Tap{' '}
                          <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Import Departments</Text>
                          {' '}to import all missing departments and their associated channels.
                        </>
                      )}
                  </Text>
                </View>

                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>FLOWTASK DEPARTMENTS</Text>

                {loadingDepts ? (
                  <View style={styles.center}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>Loading...</Text>
                  </View>
                ) : deptError ? (
                  <View style={[styles.errorBox, { backgroundColor: '#fff1f2', borderColor: '#fda4af' }]}>
                    <Text style={styles.errorText}>{deptError}</Text>
                    <TouchableOpacity onPress={loadDepartments} style={styles.retryBtn}>
                      <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : departments.length === 0 ? (
                  <View style={styles.center}>
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                      No FlowTask departments are available for your account.
                    </Text>
                  </View>
                ) : (
                  departments.map(dept => {
                    const isImported = existingDeptIds.has(String(dept._id)) || existingDeptIds.has(String(dept.externalId));
                    const isExpanded = expandedDepts[dept._id];
                    const deptChannels = getDeptChannels(dept);

                    return (
                      <View
                        key={String(dept._id)}
                        style={[styles.deptCard, { borderColor: colors.border, opacity: isImported ? 0.6 : 1 }]}
                      >
                        <TouchableOpacity
                          style={[
                            styles.deptHeader,
                            { backgroundColor: colors.backgroundSecondary },
                            isExpanded && { borderBottomWidth: 1, borderBottomColor: colors.border },
                          ]}
                          onPress={() => setExpandedDepts(p => ({ ...p, [dept._id]: !p[dept._id] }))}
                          activeOpacity={0.7}
                        >
                          <View style={{ transform: [{ rotate: isExpanded ? '0deg' : '-90deg' }] }}>
                            <ChevronDown size={16} color={colors.textSecondary} />
                          </View>
                          <Text style={styles.deptEmoji}>{dept.icon || '📁'}</Text>
                          <Text style={[styles.deptName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {dept.name}
                          </Text>
                          {isImported && (
                            <View style={[styles.badge, { backgroundColor: 'rgba(0,90,158,0.1)' }]}>
                              <Text style={[styles.badgeText, { color: colors.primary }]}>Imported</Text>
                            </View>
                          )}
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={[styles.deptBody, { backgroundColor: colors.background }]}>
                            {deptChannels.length === 0 ? (
                              <Text style={[styles.deptEmpty, { color: colors.textTertiary }]}>
                                No channels are currently linked to this department.
                              </Text>
                            ) : (
                              deptChannels.map(ch => (
                                <View key={ch._id} style={styles.deptChRow}>
                                  <Check size={14} color={colors.primary} strokeWidth={3} />
                                  <Text style={[styles.deptChName, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {ch.name}
                                  </Text>
                                </View>
                              ))
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ===== Custom Category ===== */}
            {categoryType === 'custom' && (
              <View style={styles.fieldGroup}>
                {/* Category Name */}
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CATEGORY NAME</Text>
                <View style={[
                  styles.inputWrap,
                  {
                    borderColor: customName.length > 0 ? colors.primary : colors.border,
                    backgroundColor: colors.background,
                  },
                ]}>
                  <TextInput
                    style={[styles.textInput, { color: colors.textPrimary }]}
                    placeholder="e.g. Design Team"
                    placeholderTextColor={colors.textTertiary}
                    value={customName}
                    onChangeText={setCustomName}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                  <Text style={styles.emojiText}>{customIcon}</Text>
                </View>

                {/* Emoji Select List */}
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CHOOSE EMOJI ICON</Text>
                <View style={styles.emojiScrollRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiListContent}>
                    {EMOJI_LIST.map((emoji) => (
                      <TouchableOpacity
                        key={emoji}
                        style={[
                          styles.emojiSelectBtn,
                          {
                            backgroundColor: colors.backgroundSecondary,
                            borderColor: customIcon === emoji ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => setCustomIcon(emoji)}
                      >
                        <Text style={styles.emojiSelectText}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Channel Search */}
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ADD CHANNELS (OPTIONAL)</Text>

                <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Search size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                    placeholder="Search channels..."
                    placeholderTextColor={colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={6}>
                      <X size={13} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Search Results */}
                <View style={[styles.resultsBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  {channelsLoading && channels.length === 0 ? (
                    <View style={styles.resultsCenter}>
                      <Text style={[styles.helperText, { color: colors.textSecondary }]}>Loading your channels...</Text>
                    </View>
                  ) : searchResults.length > 0 ? (
                    searchResults.map(ch => {
                      const isSel = selectedChannels.some(s => s._id === ch._id);
                      return (
                        <TouchableOpacity
                          key={ch._id}
                          style={[
                            styles.resultRow,
                            { borderBottomColor: colors.border },
                            isSel && { backgroundColor: colors.primaryOverlay || 'rgba(0,90,158,0.05)' },
                          ]}
                          onPress={() => toggleChannel(ch)}
                          activeOpacity={0.7}
                        >
                          <ChannelIcon channel={ch} color={colors.textSecondary} size={14} />
                          <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {ch.name}
                          </Text>
                          {isSel && <Check size={14} color={colors.primary} strokeWidth={2.5} />}
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <View style={styles.resultsCenter}>
                      <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                        {searchQuery.trim() ? 'No accessible channels match your search.' : 'No accessible channels are available.'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Selected Channels Chips */}
                {selectedChannels.length > 0 && (
                  <View style={styles.chipsWrap}>
                    {selectedChannels.map(ch => (
                      <Chip key={ch._id} channel={ch} onRemove={removeChannel} colors={colors} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ===== No Category ===== */}
            {categoryType === 'none' && (
              <View style={[styles.noBanner, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Text style={[styles.noBannerText, { color: colors.textPrimary }]}>
                  Choose{' '}
                  <Text style={{ fontWeight: '700' }}>Update</Text>
                  {' '}to remove all category groupings for your account. No channels, messages, memberships, or history will be deleted. All accessible channels will return to the normal channel lists.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* ──────────── Footer ──────────── */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>

            {!hideDeptAction && (
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.primary },
                  (!isFormValid() || isSubmitting) && styles.submitDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!isFormValid() || isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                ) : (
                  <Check size={14} color="#fff" strokeWidth={2.5} style={{ marginRight: 4 }} />
                )}
                <Text style={styles.submitText}>{submitLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </KeyboardAwareContainer>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const SHEET_MAX_WIDTH_STATIC = 480;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },

  sheet: {
    alignSelf: 'stretch',
    borderTopLeftRadius: moderateScale(16),
    borderTopRightRadius: moderateScale(16),
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 20,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(24),
    paddingBottom: verticalScale(20),
    borderBottomWidth: 1,
    gap: scale(12),
  },
  headerIcon: {
    marginTop: verticalScale(2),
    flexShrink: 0,
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSub: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(18),
  },
  closeBtn: {
    padding: scale(4),
    borderRadius: moderateScale(4),
  },

  // ── Type Selector ──
  typeSection: {
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(16),
    borderBottomWidth: 1,
    gap: verticalScale(12),
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  radioOuter: {
    width: scale(16),
    height: scale(16),
    borderRadius: scale(8),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  radioLabel: {
    fontSize: moderateScale(14),
    fontWeight: '500',
  },

  // ── Body ──
  bodyPad: {
    padding: scale(24),
    gap: verticalScale(24),
    paddingBottom: verticalScale(16),
  },
  fieldGroup: {
    gap: verticalScale(12),
  },

  // ── Info Banner ──
  infoBanner: {
    padding: scale(16),
    borderRadius: moderateScale(8),
    borderWidth: 1,
  },
  infoBannerText: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(19),
  },

  sectionLabel: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // ── Center / Helper ──
  center: {
    paddingVertical: verticalScale(24),
    alignItems: 'center',
    gap: verticalScale(10),
  },
  helperText: {
    fontSize: moderateScale(13),
    textAlign: 'center',
  },

  // ── Error ──
  errorBox: {
    padding: scale(16),
    borderRadius: moderateScale(6),
    borderWidth: 1,
    alignItems: 'center',
    gap: verticalScale(10),
  },
  errorText: {
    fontSize: moderateScale(13),
    color: '#9f1239',
    textAlign: 'center',
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: '#fda4af',
    borderRadius: moderateScale(5),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
    backgroundColor: '#fff',
  },
  retryText: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: '#9f1239',
  },

  // ── Department Card ──
  deptCard: {
    borderWidth: 1,
    borderRadius: moderateScale(6),
    overflow: 'hidden',
    marginBottom: verticalScale(8),
  },
  deptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: scale(10),
  },
  deptEmoji: { fontSize: moderateScale(16) },
  deptName: {
    flex: 1,
    fontSize: moderateScale(14),
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
    borderRadius: moderateScale(12),
  },
  badgeText: {
    fontSize: moderateScale(11),
    fontWeight: '600',
  },
  deptBody: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: verticalScale(8),
  },
  deptEmpty: {
    fontSize: moderateScale(12),
    fontStyle: 'italic',
  },
  deptChRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingVertical: verticalScale(2),
  },
  deptChName: {
    flex: 1,
    fontSize: moderateScale(13),
  },

  // ── Field Label ──
  fieldLabel: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Input ──
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    gap: scale(10),
  },
  textInput: {
    flex: 1,
    fontSize: moderateScale(14),
    padding: 0,
  },
  emojiBtn: {
    padding: scale(2),
  },
  emojiText: {
    fontSize: moderateScale(20),
  },
  emojiScrollRow: {
    flexDirection: 'row',
    height: verticalScale(50),
    marginTop: verticalScale(4),
  },
  emojiListContent: {
    alignItems: 'center',
    gap: scale(10),
    paddingRight: scale(10),
  },
  emojiSelectBtn: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelectText: {
    fontSize: moderateScale(18),
  },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    gap: scale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(14),
    padding: 0,
  },
  resultsBox: {
    borderWidth: 1,
    borderRadius: moderateScale(6),
    maxHeight: verticalScale(160),
    overflow: 'hidden',
  },
  resultsCenter: {
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    paddingHorizontal: scale(14),
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: scale(10),
  },
  resultName: {
    flex: 1,
    fontSize: moderateScale(13),
  },

  // ── Chips ──
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    gap: scale(6),
  },
  chipName: {
    fontSize: moderateScale(12),
    fontWeight: '500',
    maxWidth: scale(120),
  },

  // ── No Category Banner ──
  noBanner: {
    padding: scale(16),
    borderRadius: moderateScale(8),
    borderWidth: 1,
  },
  noBannerText: {
    fontSize: moderateScale(13),
    lineHeight: moderateScale(20),
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(16),
    borderTopWidth: 1,
    gap: scale(12),
  },
  cancelBtn: {
    paddingVertical: verticalScale(9),
    paddingHorizontal: scale(18),
    borderRadius: moderateScale(6),
    borderWidth: 1,
  },
  cancelText: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(9),
    paddingHorizontal: scale(18),
    borderRadius: moderateScale(6),
  },
  submitDisabled: { opacity: 0.5 },
  submitText: {
    color: '#fff',
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
});