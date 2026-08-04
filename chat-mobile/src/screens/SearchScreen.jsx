import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Platform } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useThemeStore } from '../stores/themeStore';
import { searchAPI } from '../services/api';
import storage from '../services/storage';
import { Search, X, Hash, Lock, MessageSquare, Clock, FileText, FileImage, FileVideo, FileAudio, Settings, Star, Users, Bell, AtSign, Link as LinkIcon, Bookmark, Pin, Brush, User as UserIcon } from 'lucide-react-native';
import { AppAvatar , HeaderBackButton } from '../components/common';
import Toast from 'react-native-toast-message';
import logger from '../utils/logger';
import { useAuthStore } from '../stores/authStore';
import { useChannelStore } from '../stores/channelStore';
import useKeyboardBottomInset from '../hooks/useKeyboardBottomInset';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
const RECENT_KEY = 'recent_searches_objects'; // Use new key to avoid conflicts with old string array

export default function SearchScreen({ navigation }) {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [recent, setRecent] = useState([]);
  const [isFocused, setIsFocused] = useState(true);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  // Tab screens stay mounted — autoFocus only runs once. Re-focus on every visit.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => {
        clearTimeout(t);
        inputRef.current?.blur();
      };
    }, [])
  );

  useEffect(() => { loadRecent() }, []);
  
  const loadRecent = async () => {
    try { 
      const raw = await storage.getItem(RECENT_KEY); 
      if (raw) setRecent(JSON.parse(raw)); 
    } catch (err) { }
  };

  const saveRecentItem = async (item) => {
    try {
      const id = item._id || item.id;
      if (!id) return;
      const filtered = (recent || []).filter(r => (r._id || r.id) !== id);
      filtered.unshift(item);
      const finalRecent = filtered.slice(0, 15);
      await storage.setItem(RECENT_KEY, JSON.stringify(finalRecent));
      setRecent(finalRecent);
    } catch {}
  };

  const removeRecent = async (idToRemove) => {
    try {
      const updated = recent.filter(r => (r._id || r.id) !== idToRemove);
      await storage.setItem(RECENT_KEY, JSON.stringify(updated));
      setRecent(updated);
    } catch {}
  };

  const clearAllRecent = async () => {
    try {
      await storage.removeItem(RECENT_KEY);
      setRecent([]);
    } catch {}
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query) { setResults(null); return; }
    debounceRef.current = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const doSearch = async (q) => {
    setLoading(true);
    try {
      // Omit 'scope' parameter for Global Workspace Search exactly like the Web App does.
      // Providing scope='all' causes the backend to improperly filter results.
      const res = await searchAPI.global(q);
      const data = res?.data?.data || res?.data || null;
      setResults(data);
    } catch (err) {
      logger.error('Search failed', err?.response?.data || err.message || err);
      Toast.show({ type: 'error', text1: 'Search failed' });
    } finally { setLoading(false); }
  };

  const flattenedResults = useMemo(() => {
    if (!results) return null;
    const allItems = [];
    const seenIds = new Set();

    const getItemKey = (item) => {
      return [item?.type, item?._id, item?.id, item?.referenceId, item?.messageId, item?.channelId, item?.path, item?.url, item?.label]
        .filter(Boolean).join(':');
    };

    const addItems = (items) => {
      if (Array.isArray(items)) {
        items.forEach(it => {
          const id = getItemKey(it) || Math.random().toString();
          if (!seenIds.has(id)) {
            seenIds.add(id);
            allItems.push(it);
          }
        });
      }
    };

    addItems(results.topMatches);
    addItems(results.users);
    addItems(results.messages);
    addItems(results.channels);
    addItems(results.dms);
    addItems(results.files);
    addItems(results.links);
    addItems(results.pages);
    addItems(results.canvas);

    return allItems;
  }, [results]);

  const getIcon = (item) => {
    switch (item.type) {
      case 'message': return <MessageSquare size={16} color={colors.textSecondary} />;
      case 'channel': return item.visibility === 'private' ? <Lock size={16} color={colors.textSecondary} /> : <Hash size={16} color={colors.textSecondary} />;
      case 'dm': return <Lock size={16} color={colors.textSecondary} />;
      case 'file': 
        if (item.mimeType?.startsWith('image/')) return <FileImage size={16} color={colors.textSecondary} />;
        if (item.mimeType?.startsWith('video/')) return <FileVideo size={16} color={colors.textSecondary} />;
        if (item.mimeType?.startsWith('audio/')) return <FileAudio size={16} color={colors.textSecondary} />;
        return <FileText size={16} color={colors.textSecondary} />;
      case 'link': return <LinkIcon size={16} color={colors.textSecondary} />;
      case 'canvas': return <Brush size={16} color={colors.textSecondary} />;
      case 'page':
        switch (item.iconKey || item.path) {
          case 'settings': return <Settings size={16} color={colors.textSecondary} />;
          case 'star':
          case 'starred': return <Star size={16} color={colors.textSecondary} />;
          case 'users':
          case 'directories': return <Users size={16} color={colors.textSecondary} />;
          case 'message':
          case 'threads': return <MessageSquare size={16} color={colors.textSecondary} />;
          case 'activity': return <Bell size={16} color={colors.textSecondary} />;
          case 'files': return <FileText size={16} color={colors.textSecondary} />;
          default: return <AtSign size={16} color={colors.textSecondary} />;
        }
      case 'saved': return <Bookmark size={16} color={colors.textSecondary} />;
      case 'pin': return <Pin size={16} color={colors.textSecondary} />;
      case 'recentSearch': return <Clock size={16} color={colors.textSecondary} />;
      case 'user': return <UserIcon size={16} color={colors.textSecondary} />;
      default: return <Search size={16} color={colors.textSecondary} />;
    }
  };

  const getTitle = (item) => {
    switch (item.type) {
      case 'recentSearch': return item.label || 'Recent search';
      case 'user': return item.name || item.email || 'Unknown User';
      case 'message':
      case 'saved':
      case 'pin': return item.snippet || 'Message';
      case 'channel': return item.visibility === 'private' ? `🔒 ${item.name || item.slug}` : `# ${item.name || item.slug}`;
      case 'dm': return `🔒 ${item.name || item.slug || 'Direct Message'}`;
      case 'file': return item.name || 'Untitled file';
      case 'link': return item.title || item.url;
      case 'page': return item.label;
      case 'canvas': return item.title || item.name || 'Canvas';
      default: return item.name || item.label || item.fileName || item.title || 'Untitled';
    }
  };

  const getSubtitle = (item) => {
    let detail = '';
    switch (item.type) {
      case 'recentSearch': detail = 'Press enter to search again'; break;
      case 'message':
      case 'saved':
      case 'pin':
        detail = [item.senderName || 'Someone', item.channelName ? `in ${item.channelName}` : null].filter(Boolean).join(' ');
        break;
      case 'channel':
      case 'dm':
        detail = [item.topic || item.description, item.memberCount != null && item.type === 'channel' ? `${item.memberCount} members` : null].filter(Boolean).join(' · ');
        break;
      case 'file':
        detail = [item.uploadedBy ? `Uploaded by ${item.uploadedBy}` : null, item.channelName ? `in ${item.channelName}` : null].filter(Boolean).join(' · ');
        break;
      case 'link': detail = item.url; break;
      case 'page': detail = 'Go to page'; break;
    }
    return [item.reasonLabel && item.type !== 'recentSearch' ? item.reasonLabel : null, detail].filter(Boolean).join(' · ');
  };

  const renderResultItem = ({ item: it }) => {
    const handlePress = async () => {
      if (it.type === 'recentSearch') {
        setQuery(it.label || '');
        return;
      }

      saveRecentItem(it);
      
      if (it.type === 'channel' || it.type === 'dm') {
        navigation.navigate('Chat', { channelId: it._id, channelName: it.name });
      } else if (it.type === 'user') {
        try {
          const userId = it.id || it._id;
          const channel = await useChannelStore.getState().createDM(userId);
          if (channel?._id) {
            navigation.navigate('Chat', { channelId: channel._id, channelName: channel.name || it.name || it.label });
          }
        } catch (error) {
          Toast.show({ type: 'error', text1: 'Failed to open DM' });
        }
      } else if (it.type === 'file') {
        navigation.navigate('Chat', { channelId: it.channelId });
      } else if (it.type === 'message' || it.type === 'saved' || it.type === 'pin') {
        const chId = it.channelId?._id || it.channelId;
        navigation.navigate('Chat', {
          channelId: chId || it.channel,
          channelName: it.channelName || 'Chat',
          messageId: it._id || it.messageId,
        });
      } else if (it.type === 'thread') {
        navigation.navigate('ThreadDetail', {
          rootMessageId: it._id || it.rootMessageId,
          channelId: it.channelId?._id || it.channelId,
          channelName: it.channelName || 'Thread',
          rootContent: it.snippet || it.content || '',
          replyCount: it.replyCount || 0,
        });
      } else if (it.type === 'canvas') {
        navigation.navigate('CanvasEditor', { canvasId: it.referenceId || it.id });
      } else if (it.type === 'page') {
        switch (it.path) {
          case 'settings': navigation.navigate('Preferences'); break;
          case 'activity': navigation.navigate('Notifications'); break;
          case 'threads': navigation.navigate('Threads'); break;
          case 'directories': navigation.navigate('People'); break;
          case 'files': navigation.navigate('Files'); break;
          case 'profile': navigation.navigate('Profile'); break;
          default: break;
        }
      } else {
        if (it.url && Platform.OS !== 'web') {
           // Standard links handled by RN Linking typically, but alert for safety if unspecified
           Alert.alert('Link', it.url);
        } else {
           Alert.alert(it.label || it.name || it.fileName || 'Result', it.snippet || '');
        }
      }
    };

    return (
      <View style={styles.resultRow}>
        <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={handlePress}>
          {it.type === 'user' ? (
            <AppAvatar user={it} size={32} showStatus statusSize={10} />
          ) : it.type === 'dm' ? (
            <AppAvatar user={{ _id: it._id, name: it.name, avatar: it.avatar }} size={32} showStatus={false} />
          ) : (
            <View style={[styles.resultIcon, { backgroundColor: colors.backgroundSecondary }]}>
               {getIcon(it)}
            </View>
          )}
          
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '400', fontSize: moderateScale(16) }} numberOfLines={1}>{getTitle(it)}</Text>
            {getSubtitle(it) ? <Text style={{ color: colors.textTertiary, marginTop: verticalScale(4), fontSize: moderateScale(13) }} numberOfLines={1}>{getSubtitle(it)}</Text> : null}
          </View>
        </TouchableOpacity>
        
        {!query && (
          <TouchableOpacity onPress={() => removeRecent(it._id || it.id)} style={{ padding: moderateScale(8) }}>
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const { keyboardHeightShared } = useKeyboardBottomInset();
  const tabBarHeight = React.useContext(BottomTabBarHeightContext) || 0;
  const closedGap = tabBarHeight > 0 ? verticalScale(8) : insets.bottom + verticalScale(8);

  // Resting gap when closed, keyboard height plus that same gap when open —
  // guarantees the pill always clears the IME, same formula on both platforms.
  const floatingSearchAnimatedStyle = useAnimatedStyle(() => {
    const height = Math.max(0, -keyboardHeightShared.value);
    return { paddingBottom: closedGap + height };
  }, [closedGap]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Dark Header */}
      <SafeAreaView
        edges={['top']}
        style={{ backgroundColor: colors.primary }}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textOnPrimary }]}>Search</Text>
          <TouchableOpacity onPress={() => {/* optional profile press */}}>
            <AppAvatar user={user} size={36} showStatus statusSize={10} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.keyboardView}>
        <View style={{ flex: 1 }}>
          <FlatList
            data={query ? (flattenedResults || []) : recent}
            keyExtractor={(item, idx) => {
              const base = item?.type ? `${item.type}:` : '';
              const id = item?._id || item?.id || item?.referenceId || item?.path || '';
              return `${base}${id}:${idx}`;
            }}
            renderItem={renderResultItem}
            contentContainerStyle={{ paddingHorizontal: scale(16), paddingTop: verticalScale(16), paddingBottom: verticalScale(16) }}
            ListHeaderComponent={() => (
              <View>
                {!query && recent && recent.length > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(12) }}>
                    <Text style={{ color: colors.textTertiary, fontWeight: '700' }}>Recent searches</Text>
                    <TouchableOpacity onPress={clearAllRecent}>
                      <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13) }}>Clear All</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {loading && <ActivityIndicator style={{ marginTop: verticalScale(16) }} />}
                {!flattenedResults && !loading && !!query && (
                   <View style={{ padding: moderateScale(16) }}>
                     <Text style={{ color: colors.textTertiary }}>No results found for "{query}"</Text>
                   </View>
                )}
                {flattenedResults && flattenedResults.length === 0 && !loading && !!query && (
                   <View style={{ padding: moderateScale(16) }}>
                     <Text style={{ color: colors.textTertiary }}>No results found for "{query}"</Text>
                   </View>
                )}
              </View>
            )}
          />

          {/* Floating Search Bar */}
          <Animated.View
            style={[
              styles.floatingSearchContainer,
              { backgroundColor: colors.background },
              floatingSearchAnimatedStyle,
            ]}
          >
            <View style={[
              styles.floatingSearchPill,
              { backgroundColor: colors.background, shadowColor: colors.shadow || '#000', borderWidth: 1, borderColor: colors.border }
            ]}>
              <Search size={20} color={isFocused ? colors.primary : colors.textSecondary} />
              <TextInput
                ref={inputRef}
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search"
                placeholderTextColor={colors.textTertiary}
                value={query}
                onChangeText={setQuery}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoFocus
                showSoftInputOnFocus
              />
            </View>
            <TouchableOpacity
              style={[
                styles.closeButton,
                {
                  backgroundColor: colors.background,
                  shadowColor: colors.shadow || '#000',
                  borderColor: colors.border,
                  borderWidth: 1
                }
              ]}
              onPress={() => { setQuery(''); navigation.goBack(); }}
            >
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(12),
  },
  headerTitle: {
    fontSize: moderateScale(22),
    fontWeight: '700',
  },
  keyboardView: {
    flex: 1,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: moderateScale(10) },
  resultIcon: { width: moderateScale(32), height: moderateScale(32), borderRadius: moderateScale(8), justifyContent: 'center', alignItems: 'center' },
  floatingSearchContainer: {
    flexDirection: 'row',
    paddingHorizontal: moderateScale(16),
    paddingTop: moderateScale(12),
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent', // keep layout matching
  },
  floatingSearchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(999),
    paddingHorizontal: moderateScale(16),
    height: moderateScale(52),
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    marginLeft: moderateScale(12),
    fontSize: moderateScale(16),
    height: '100%',
  },
  closeButton: {
    width: moderateScale(52),
    height: moderateScale(52),
    borderRadius: moderateScale(26),
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
});

