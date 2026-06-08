import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { searchAPI } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Search, X, Hash, Lock, MessageSquare } from 'lucide-react-native';
import Avatar from '../components/Avatar';
import Toast from 'react-native-toast-message';

const RECENT_KEY = 'recent_searches';

export default function SearchScreen({ navigation }) {
  const { colors } = useThemeStore();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [recent, setRecent] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => { loadRecent() }, []);
  const loadRecent = async () => {
    try { const raw = await AsyncStorage.getItem(RECENT_KEY); if (raw) setRecent(JSON.parse(raw)); } catch (err) { }
  };

  const saveRecent = async (q) => {
    try {
      const updated = [q, ...(recent || []).filter(r => r !== q)].slice(0, 10);
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      setRecent(updated);
    } catch {}
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query) { setResults(null); return; }
    debounceRef.current = setTimeout(() => doSearch(query, scope), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, scope]);

  const doSearch = async (q, currentScope) => {
    setLoading(true);
    try {
      const res = await searchAPI.global(q, { scope: currentScope, limit: 20 });
      const data = res?.data?.data || res?.data || null;
      setResults(data);
      await saveRecent(q);
    } catch (err) {
      console.error('Search failed', err?.response?.data || err.message || err);
      Toast.show({ type: 'error', text1: 'Search failed' });
    } finally { setLoading(false); }
  };

  const scopes = ['all','channels','dms','messages','threads','files','members','drafts','scheduled'];

  const renderTop = () => (
    <View style={{ padding: 12 }}>
      <View style={[styles.searchBox, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}> 
        <Search size={18} color={colors.textSecondary} />
        <TextInput style={{ flex: 1, marginLeft: 8, color: colors.inputText }} placeholder="Search" placeholderTextColor={colors.inputPlaceholder} value={query} onChangeText={setQuery} />
        {query ? <TouchableOpacity onPress={() => setQuery('')}><X size={18} color={colors.textSecondary} /></TouchableOpacity> : null}
      </View>

      <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        {scopes.map(s => (
          <TouchableOpacity key={s} onPress={() => setScope(s)} style={[styles.scopePill, scope === s && { backgroundColor: colors.primary }]}>
            <Text style={{ color: scope === s ? '#fff' : colors.textSecondary, fontWeight: '700' }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {recent && recent.length > 0 && !query && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: colors.textTertiary, fontWeight: '700', marginBottom: 8 }}>Recent searches</Text>
          {recent.map(r => (
            <TouchableOpacity key={r} onPress={() => setQuery(r)} style={{ paddingVertical: 8 }}>
              <Text style={{ color: colors.textPrimary }}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderResultSection = (sectionKey, items) => {
    if (!items || items.length === 0) return null;
    return (
      <View style={{ padding: 12 }} key={sectionKey}>
        <Text style={{ color: colors.textTertiary, fontWeight: '700', marginBottom: 8 }}>{sectionKey}</Text>
        {items.map((it) => (
          <TouchableOpacity key={it.id || it._id || it._id} onPress={() => {
            // navigate based on type
            if (it.type === 'channel' || it.type === 'dm') {
              navigation.navigate('Chat', { channelId: it._id, channelName: it.name });
            } else if (it.type === 'user') {
              navigation.navigate('Chat', { channelId: it.id || it._id, channelName: it.name || it.label });
            } else if (it.type === 'file') {
              navigation.navigate('Files', { channelId: it.channelId });
            } else if (it.type === 'message') {
              const chId = it.channelId?._id || it.channelId;
              navigation.navigate('Chat', {
                channelId: chId || it.channel,
                channelName: it.channelName || 'Chat',
                messageId: it._id,
              });
            } else if (it.type === 'thread') {
              navigation.navigate('ThreadDetail', {
                rootMessageId: it._id || it.rootMessageId,
                channelId: it.channelId?._id || it.channelId,
                channelName: it.channelName || 'Thread',
                rootContent: it.snippet || it.content || '',
                replyCount: it.replyCount || 0,
              });
            } else {
              Alert.alert(it.label || it.name || it.fileName || 'Result', it.snippet || '');
            }
          }} style={styles.resultRow}>
            {it.type === 'user' ? (
              <Avatar user={it} size={32} showStatus />
            ) : it.type === 'channel' ? (
              <View style={[styles.resultIcon, { backgroundColor: colors.backgroundSecondary }]}>
                {it.visibility === 'private' ? <Lock size={16} color={colors.textSecondary} /> : <Hash size={16} color={colors.textSecondary} />}
              </View>
            ) : it.type === 'dm' ? (
              <View style={[styles.resultIcon, { backgroundColor: colors.backgroundSecondary }]}>
                <MessageSquare size={16} color={colors.textSecondary} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{it.name || it.label || it.fileName || it.title}</Text>
              {it.snippet ? <Text style={{ color: colors.textTertiary, marginTop: 4 }}>{it.snippet}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      {renderTop()}
      {loading && <ActivityIndicator style={{ marginTop: 8 }} />}
      {results ? (
        <FlatList
          data={[]}
          ListHeaderComponent={() => (
            <View>
              {renderResultSection('topMatches', results.topMatches)}
              {renderResultSection('users', results.users)}
              {renderResultSection('channels', results.channels)}
              {renderResultSection('dms', results.dms)}
              {renderResultSection('messages', results.messages)}
              {renderResultSection('files', results.files)}
            </View>
          )}
          keyExtractor={(item, idx) => String(idx)}
          renderItem={null}
        />
      ) : (
        <View style={{ padding: 12 }}>
          <Text style={{ color: colors.textTertiary }}>Type to search across channels, messages, files, people and more.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 8, borderWidth: 1 },
  scopePill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, marginRight: 8, marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  resultIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
});
