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
  KeyboardAvoidingView,
} from 'react-native';
import KeyboardAwareContainer from './common/KeyboardAwareContainer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { useChannelStore } from '../stores/channelStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChannels } from '../hooks/queries/useChannels';
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
  Plus,
} from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { isChatAppChannel } from '../utils/channelOrigin';
import Button from './common/Button';
import IconButton from './common/IconButton';

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
    <IconButton icon={X} size={16} iconSize={11} variant="ghost" onPress={() => onRemove(channel._id)} />
  </View>
);

// ─── EMOJI cycle list ─────────────────────────────────────────────────────────
const EMOJI_LIST = ['✨', '📁', '🎯', '🚀', '💡', '📌', '🔖', '🗂️', '📊', '🎨', '🏆', '💼'];

export default function CreateCategoryModal({ visible, onClose }) {
  const { colors } = useThemeStore();
  const { width: screenWidth } = useWindowDimensions();
  const SHEET_MAX_WIDTH = 480;
  const isWide = screenWidth > SHEET_MAX_WIDTH;
  const { activeWorkspace } = useWorkspaceStore();
  const { data: channels = [], isLoading: channelsLoading, refetch: fetchChannels } = useChannels(activeWorkspace?._id);
  const { categories, fetchCategories } = useChannelStore();

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
  const [step, setStep] = useState(1);
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

  const departmentsWithChannels = useMemo(
    () => departments.filter(d => getDeptChannels(d).length > 0),
    [departments, getDeptChannels],
  );

  const allImported = !loadingDepts && departmentsWithChannels.length > 0 && missingDepts.length === 0;
  const hideDeptAction = categoryType === 'department'
    && (allImported || (!loadingDepts && departmentsWithChannels.length === 0));

  const assignedChannelIds = useMemo(() => {
    const ids = new Set();
    categories.forEach(cat => {
      if (Array.isArray(cat.channelIds)) {
        cat.channelIds.forEach(id => ids.add(String(id?._id || id)));
      }
    });
    return ids;
  }, [categories]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return channels
      .filter(c => {
        if (!isChatAppChannel(c) || c.isArchived) return false;
        
        const isDept = c.flowTaskRef?.entityType === 'department' && !!c.flowTaskRef?.entityId;
        const isProj = !!c.departmentRef?.departmentId;
        const isAssignedToDept = isDept || isProj;
        
        const isAssignedToCategory = assignedChannelIds.has(String(c._id));

        return !isAssignedToDept && !isAssignedToCategory;
      })
      .filter(c => (!q || c.name?.toLowerCase().includes(q)) && !selectedChannels.some(s => s._id === c._id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, 50);
  }, [searchQuery, channels, selectedChannels, assignedChannelIds]);

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
    try {
      const response = await syncDepartmentsSingleton();
      if (seq !== deptSeq.current) return;
      const list = response?.data?.data || response?.data || [];
      setDepartments(Array.isArray(list) ? list : []);
      setDeptError(null);
    } catch (syncErr) {
      try {
        const fallbackResponse = await categoryAPI.getDepartments();
        if (seq !== deptSeq.current) return;
        const cached = fallbackResponse?.data?.data || fallbackResponse?.data || [];
        setDepartments(Array.isArray(cached) ? cached : []);
        if (cached.length === 0) {
          setDeptError(syncErr.response?.data?.error?.message
            || 'Unable to synchronize departments from FlowTask.');
        } else {
          setDeptError(null);
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
      setStep(1);
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
      <KeyboardAwareContainer bottomSafeContext={true} style={styles.overlay}>
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
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                {step === 2 ? 'Add Channels' : 'Create Category'}
              </Text>
              {categoryType === 'custom' ? (
                <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                  Step {step} of 2 {step === 1 ? '· Details' : '· Selection'}
                </Text>
              ) : (
                <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                  Organize your channels into structured groups
                </Text>
              )}
            </View>
            <TouchableOpacity 
              onPress={onClose} 
              hitSlop={8} 
              style={[styles.closeBtn, { backgroundColor: colors.backgroundSecondary }]}
            >
              <X size={18} color={colors.textSecondary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* ──────────── Type Selector ──────────── */}
          {step === 1 && (
            <View style={[styles.typeSection, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: scale(8) }}>
                <TouchableOpacity
                  style={[
                    styles.typeCard,
                    { borderColor: colors.border, backgroundColor: colors.backgroundSecondary },
                    categoryType === 'department' && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }
                  ]}
                  onPress={() => setCategoryType('department')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeCardEmoji}>🏢</Text>
                  <Text style={[styles.typeCardLabel, { color: categoryType === 'department' ? colors.primary : colors.textPrimary }]}>
                    Department
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeCard,
                    { borderColor: colors.border, backgroundColor: colors.backgroundSecondary },
                    categoryType === 'custom' && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }
                  ]}
                  onPress={() => setCategoryType('custom')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeCardEmoji}>✨</Text>
                  <Text style={[styles.typeCardLabel, { color: categoryType === 'custom' ? colors.primary : colors.textPrimary }]}>
                    Custom
                  </Text>
                </TouchableOpacity>

                {hasDeptCategory && (
                  <TouchableOpacity
                    style={[
                      styles.typeCard,
                      { borderColor: colors.border, backgroundColor: colors.backgroundSecondary },
                      categoryType === 'none' && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }
                    ]}
                    onPress={() => setCategoryType('none')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.typeCardEmoji}>🚫</Text>
                    <Text style={[styles.typeCardLabel, { color: categoryType === 'none' ? colors.primary : colors.textPrimary }]}>
                      None
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          )}

          {/* ──────────── Body ──────────── */}
          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={styles.bodyPad}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ===== Department ===== */}
            {step === 1 && categoryType === 'department' && (
              <View style={styles.fieldGroup}>
                {/* Info banner */}
                <View style={[styles.infoBanner, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                  <Text style={[styles.infoBannerText, { color: colors.textSecondary }]}>
                    {allImported
                      ? 'All FlowTask departments with channels are already available in your Categories.'
                      : departmentsWithChannels.length === 0 && !loadingDepts
                      ? 'No FlowTask departments currently have linked channels.'
                      : (
                        <>
                          Departments are synchronized automatically from FlowTask. Tap{' '}
                          <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Import Departments</Text>
                          {' '}to import all missing departments and their associated channels.
                        </>
                      )}
                  </Text>
                </View>

                {deptError ? (
                  <View style={[styles.errorBox, { backgroundColor: '#fff1f2', borderColor: '#fda4af' }]}>
                    <Text style={styles.errorText}>{deptError}</Text>
                    <Button
                      title={loadingDepts ? 'Retrying...' : 'Retry'}
                      variant="ghost"
                      onPress={loadDepartments}
                      disabled={loadingDepts}
                      style={styles.retryBtn}
                      textStyle={styles.retryText}
                      loading={loadingDepts}
                    />
                  </View>
                ) : loadingDepts ? (
                  <View style={styles.center}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>Loading...</Text>
                  </View>
                ) : departments.length === 0 ? (
                  <View style={styles.center}>
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                      No FlowTask departments are available for your account.
                    </Text>
                  </View>
                ) : departmentsWithChannels.length === 0 ? (
                  <View style={styles.center}>
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                      No departments with channels are available to import.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.deptList}>
                    {missingDepts.map((d, dIdx) => {
                      const deptChannels = getDeptChannels(d);
                      const isExp = expandedDepts[d._id];
                      return (
                        <View key={`${d._id}-${dIdx}`} style={[styles.deptCard, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
                          <TouchableOpacity
                            style={styles.deptHeader}
                            onPress={() => setExpandedDepts(prev => ({ ...prev, [d._id]: !isExp }))}
                            activeOpacity={0.7}
                          >
                            <View style={styles.deptTitleRow}>
                              <FolderPlus size={18} color={colors.primary} />
                              <Text style={[styles.deptName, { color: colors.textPrimary }]} numberOfLines={1}>
                                {d.name}
                              </Text>
                            </View>
                            <View style={styles.deptCountRow}>
                              <Text style={[styles.deptCountText, { color: colors.textSecondary }]}>
                                {deptChannels.length} {deptChannels.length === 1 ? 'channel' : 'channels'}
                              </Text>
                              <ChevronDown
                                size={18}
                                color={colors.textTertiary}
                                style={{ transform: [{ rotate: isExp ? '180deg' : '0deg' }] }}
                              />
                            </View>
                          </TouchableOpacity>

                          {isExp && (
                            <View style={[styles.deptBody, { borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.background }]}>
                              {deptChannels.length === 0 ? (
                                <Text style={[styles.deptEmpty, { color: colors.textTertiary }]}>
                                  No channels are currently linked to this department.
                                </Text>
                              ) : (
                                deptChannels.map((ch, cIdx) => (
                                  <View key={`${ch._id}-${cIdx}`} style={styles.deptChRow}>
                                    <ChannelIcon channel={ch} color={colors.textTertiary} size={14} />
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
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ===== Custom Category Step 1 ===== */}
            {step === 1 && categoryType === 'custom' && (
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
              </View>
            )}

            {/* ===== Custom Category Step 2 ===== */}
            {step === 2 && categoryType === 'custom' && (
              <View style={styles.fieldGroup}>
                {/* Selected Channels Chips */}
                {selectedChannels.length > 0 && (
                  <View style={{ maxHeight: moderateScale(60), marginBottom: verticalScale(12) }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2, gap: 8 }}>
                      {selectedChannels.map((ch, idx) => (
                        <Chip key={`${ch._id}-${idx}`} channel={ch} onRemove={removeChannel} colors={colors} />
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground || colors.background, paddingVertical: Platform.OS === 'ios' ? 10 : 2 }]}>
                  <Search size={18} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.textPrimary, fontSize: moderateScale(15), marginLeft: 8 }]}
                    placeholder="Search channels..."
                    placeholderTextColor={colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={6}>
                      <X size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Search Results */}
                <View style={[styles.resultsBox, { borderColor: colors.border, backgroundColor: colors.background, marginTop: verticalScale(8), borderRadius: moderateScale(8) }]}>
                  {channelsLoading && channels.length === 0 ? (
                    <View style={styles.resultsCenter}>
                      <Text style={[styles.helperText, { color: colors.textSecondary }]}>Loading your channels...</Text>
                    </View>
                  ) : searchResults.length > 0 ? (
                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: verticalScale(400) }} keyboardShouldPersistTaps="handled">
                      {searchResults.map((ch, idx) => {
                        const isSel = selectedChannels.some(s => s._id === ch._id);
                        return (
                          <TouchableOpacity
                            key={`${ch._id}-${idx}`}
                            style={[
                              styles.resultRow,
                              { borderBottomColor: colors.border, paddingVertical: verticalScale(10), paddingHorizontal: scale(12) },
                              isSel && { backgroundColor: colors.primary + '10' },
                            ]}
                            onPress={() => toggleChannel(ch)}
                            activeOpacity={0.7}
                          >
                            <ChannelIcon channel={ch} color={colors.textSecondary} size={16} />
                            <Text style={[styles.resultName, { color: colors.textPrimary, fontSize: moderateScale(15), marginLeft: scale(10), flex: 1 }]} numberOfLines={1}>
                              {ch.name}
                            </Text>
                            <View style={[
                              { width: 18, height: 18, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
                              { borderColor: isSel ? colors.primary : colors.border },
                              isSel && { backgroundColor: colors.primary }
                            ]}>
                              {isSel ? <Check size={12} color="#fff" strokeWidth={3} /> : <Plus size={12} color={colors.textTertiary} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={styles.resultsCenter}>
                      <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                        {searchQuery.trim() ? 'No accessible channels match your search.' : 'No accessible channels are available.'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ===== No Category ===== */}
            {step === 1 && categoryType === 'none' && (
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
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            {step === 1 && categoryType === 'custom' ? (
              <Button
                title="Next"
                variant="primary"
                onPress={() => setStep(2)}
                disabled={!isFormValid()}
              />
            ) : !hideDeptAction ? (
              <Button
                title={submitLabel}
                variant="primary"
                icon={Check}
                onPress={handleSubmit}
                disabled={!isFormValid() || isSubmitting}
                loading={isSubmitting}
              />
            ) : null}

             <Button
              title={step === 2 ? "Back" : "Cancel"}
              variant="ghost"
              onPress={step === 2 ? () => setStep(1) : onClose}
              disabled={isSubmitting}
            />
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
    flexShrink: 1,
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
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    gap: scale(8),
  },
  typeCardEmoji: {
    fontSize: moderateScale(16),
  },
  typeCardLabel: {
    fontSize: moderateScale(14),
    fontWeight: '600',
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
    borderWidth: 1.5,
    borderRadius: moderateScale(10),
    overflow: 'hidden',
    marginBottom: verticalScale(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  deptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    justifyContent: 'space-between',
  },
  deptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: scale(10),
    paddingRight: scale(10),
  },
  deptName: {
    flex: 1,
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  deptCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  deptCountText: {
    fontSize: moderateScale(13),
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
    borderWidth: 1.5,
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    gap: scale(10),
  },
  textInput: {
    flex: 1,
    fontSize: moderateScale(15),
    padding: 0,
  },
  emojiBtn: {
    padding: scale(2),
  },
  emojiText: {
    fontSize: moderateScale(22),
  },
  emojiScrollRow: {
    flexDirection: 'row',
    height: verticalScale(54),
    marginTop: verticalScale(4),
  },
  emojiListContent: {
    alignItems: 'center',
    gap: scale(12),
    paddingRight: scale(10),
  },
  emojiSelectBtn: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelectText: {
    fontSize: moderateScale(22),
  },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: scale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(15),
    padding: 0,
  },
  resultsBox: {
    borderWidth: 1.5,
    borderRadius: moderateScale(10),
    maxHeight: verticalScale(400),
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(16),
    borderTopWidth: 1,
    gap: scale(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 10,
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