import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, X, Lock, Hash, Search, FileText, File } from 'lucide-react-native';
import { useThemeStore } from '../stores/themeStore';
import { messageAPI, fileAPI, canvasAPI } from '../services/api';
import { AppAvatar } from '../components/common';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import dayjs from 'dayjs';
import Toast from 'react-native-toast-message';

const HighlightedText = ({ text, highlight, style, highlightStyle }) => {
  if (!highlight || !highlight.trim()) {
    return <Text style={style}>{text}</Text>;
  }

  // Also match @mentions for blue color
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|@[\\w.-]+)`, 'gi');
  const parts = text.split(regex);

  return (
    <Text style={style} numberOfLines={2}>
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === highlight.toLowerCase();
        const isMention = part.startsWith('@');
        
        let customStyle = {};
        if (isMatch) customStyle = highlightStyle;
        else if (isMention) customStyle = { color: '#3182CE' }; // blue for mentions
        
        return <Text key={i} style={customStyle}>{part}</Text>;
      })}
    </Text>
  );
};

export default function ChannelSearchScreen({ route, navigation }) {
  const { channelId, channelName, isPrivate } = route.params || {};
  const { colors } = useThemeStore();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('messages');
  const [loading, setLoading] = useState(false);
  
  const [results, setResults] = useState([]);
  const [filesResults, setFilesResults] = useState([]);
  const [canvasesResults, setCanvasesResults] = useState([]);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    // Focus input on mount
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setFilesResults([]);
      setCanvasesResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const performSearch = async (searchQuery) => {
    setLoading(true);
    try {
      // 1. Messages
      const res = await messageAPI.search({ q: searchQuery, channelId });
      const items = res.data?.data?.messages || res.data?.messages || [];
      const finalItems = Array.isArray(items) ? items : (Array.isArray(res.data?.data) ? res.data.data : []);
      setResults(finalItems);

      // 2. Files
      if (channelId) {
        const filesRes = await fileAPI.listByChannel(channelId, { limit: 200 });
        const allFiles = filesRes?.data?.data?.items || filesRes?.data?.items || [];
        const filteredFiles = allFiles.filter(f => (f.fileName || '').toLowerCase().includes(searchQuery.toLowerCase()));
        setFilesResults(filteredFiles);
      } else {
        setFilesResults([]);
      }

      // 3. Canvases
      if (channelId) {
        const canvasRes = await canvasAPI.getAllForChannel(channelId);
        const allCanvases = canvasRes?.data?.data || canvasRes?.data || [];
        const filteredCanvases = allCanvases.filter(c => (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()));
        setCanvasesResults(filteredCanvases);
      } else {
        setCanvasesResults([]);
      }

    } catch (err) {
      console.log('Search error:', err);
      Toast.show({ type: 'error', text1: 'Failed to search' });
    } finally {
      setLoading(false);
    }
  };

  const renderMessageResult = ({ item }) => {
    const sender = item.authorId || item.senderId || {};
    const formattedTime = dayjs(item.createdAt).format('h:mm A');
    const formattedDate = dayjs(item.createdAt).format('MMM D');
    
    const reactionText = item.reactions && item.reactions.length > 0 
      ? `${item.reactions[0].emoji} ${item.reactions[0].users?.length || 1}` 
      : null;

    return (
      <TouchableOpacity 
        style={[styles.resultItem, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('Chat', { channelId: item.channelId?._id || item.channelId, messageId: item._id, searchQuery: query })}
      >
        <View style={styles.channelContextRow}>
          {isPrivate ? (
            <Lock size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
          ) : (
            <Hash size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
          )}
          <Text style={[styles.contextText, { color: colors.textSecondary }]}>
            {channelName || 'channel'} - {formattedDate}
          </Text>
          <Text style={[styles.timeText, { color: colors.textTertiary, marginLeft: 'auto' }]}>
            {formattedTime}
          </Text>
        </View>

        <View style={styles.messageContentRow}>
          <AppAvatar user={sender} size={36} />
          <View style={styles.messageBody}>
            <Text style={[styles.senderName, { color: colors.textPrimary }]}>
              {sender.name || 'Unknown'}
            </Text>
            <HighlightedText 
              text={item.content || item.snippet || ''} 
              highlight={query}
              style={[styles.messageText, { color: colors.textPrimary }]}
              highlightStyle={{ backgroundColor: '#F6E05E', color: '#000' }}
            />
            
            {reactionText && (
              <View style={[styles.reactionBadge, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <Text style={{ fontSize: moderateScale(12), color: colors.textPrimary }}>{reactionText}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFileResult = ({ item }) => {
    return (
      <TouchableOpacity 
        style={[styles.resultItem, { borderBottomColor: colors.border }]}
        onPress={() => Toast.show({ type: 'info', text1: 'Go to Files tab to open' })}
      >
        <View style={styles.messageContentRow}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
            <FileText size={24} color={colors.textSecondary} />
          </View>
          <View style={styles.messageBody}>
            <Text style={[styles.senderName, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.fileName}
            </Text>
            <Text style={[styles.messageText, { color: colors.textSecondary }]}>
              {item.uploadedBy?.name || 'Unknown'} • {dayjs(item.uploadedAt).format('MMM D, YYYY')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCanvasResult = ({ item }) => {
    return (
      <TouchableOpacity 
        style={[styles.resultItem, { borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate('CanvasEditor', { canvasId: item._id, channelId })}
      >
        <View style={styles.messageContentRow}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
            <File size={24} color={colors.textSecondary} />
          </View>
          <View style={styles.messageBody}>
            <Text style={[styles.senderName, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title || 'Untitled Canvas'}
            </Text>
            <Text style={[styles.messageText, { color: colors.textSecondary }]}>
              Last updated {dayjs(item.updatedAt).format('MMM D, YYYY')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderActiveTabContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    let data = [];
    let renderItemFn = null;

    if (activeTab === 'messages') {
      data = results;
      renderItemFn = renderMessageResult;
    } else if (activeTab === 'files') {
      data = filesResults;
      renderItemFn = renderFileResult;
    } else if (activeTab === 'canvases') {
      data = canvasesResults;
      renderItemFn = renderCanvasResult;
    }

    if (!query) {
      return (
        <View style={styles.centerContainer}>
          <Search size={40} color={colors.textTertiary} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(15) }}>Search messages, files, and canvases</Text>
        </View>
      );
    }

    if (data.length === 0 && query) {
      return (
        <View style={styles.centerContainer}>
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(15) }}>No results found for "{query}"</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={data}
        keyExtractor={(item) => item._id || item.referenceId || item.id}
        renderItem={renderItemFn}
        contentContainerStyle={{ paddingBottom: verticalScale(20) }}
        keyboardShouldPersistTaps="handled"
      />
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Search Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: moderateScale(4) }}>
          <ChevronLeft size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        
        <View style={[styles.searchInputContainer, { backgroundColor: colors.backgroundSecondary }]}>
          <Search size={18} color={colors.textTertiary} style={{ marginLeft: scale(10) }} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={{ padding: moderateScale(8) }}>
              <X size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'messages' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('messages')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'messages' ? colors.textPrimary : colors.textSecondary }]}>
            Messages {activeTab === 'messages' && results.length > 0 ? results.length : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'files' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('files')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'files' ? colors.textPrimary : colors.textSecondary }]}>
            Files {activeTab === 'files' && filesResults.length > 0 ? filesResults.length : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'canvases' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('canvases')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'canvases' ? colors.textPrimary : colors.textSecondary }]}>
            Canvases {activeTab === 'canvases' && canvasesResults.length > 0 ? canvasesResults.length : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      {renderActiveTabContent()}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(8),
    height: moderateScale(40),
    marginLeft: scale(8),
    marginRight: scale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(16),
    paddingHorizontal: scale(10),
    height: '100%',
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: scale(16),
  },
  tab: {
    paddingVertical: verticalScale(12),
    marginRight: scale(24),
  },
  tabText: {
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultItem: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  channelContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(6),
  },
  contextText: {
    fontSize: moderateScale(13),
    fontWeight: '500',
  },
  timeText: {
    fontSize: moderateScale(12),
  },
  messageContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  messageBody: {
    flex: 1,
    marginLeft: scale(12),
  },
  senderName: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    marginBottom: verticalScale(2),
  },
  messageText: {
    fontSize: moderateScale(15),
    lineHeight: moderateScale(22),
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: verticalScale(8),
  },
  iconContainer: {
    width: scale(36),
    height: scale(36),
    borderRadius: moderateScale(8),
    justifyContent: 'center',
    alignItems: 'center',
  }
});
