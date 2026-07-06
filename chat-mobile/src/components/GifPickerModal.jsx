import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { X, Search, Smile } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GIPHY_KEY = 'dc6zaTOxFJmzC'; // Giphy public beta key (for development)
const NUM_COLS = 3;
const ITEM_SIZE = (SCREEN_WIDTH - 48) / NUM_COLS;

const FALLBACK_GIFS = [
  { id: '1', title: 'Thumbs Up', images: { fixed_height: { url: 'https://media.giphy.com/media/11ISwbgCxEzMyY/giphy.gif' } } },
  { id: '2', title: 'Mind Blown', images: { fixed_height: { url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblWQ/giphy.gif' } } },
  { id: '3', title: 'Happy Dance', images: { fixed_height: { url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif' } } },
  { id: '4', title: 'Sad', images: { fixed_height: { url: 'https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif' } } },
  { id: '5', title: 'Celebrate', images: { fixed_height: { url: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif' } } },
  { id: '6', title: 'Working', images: { fixed_height: { url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif' } } },
  { id: '7', title: 'No', images: { fixed_height: { url: 'https://media.giphy.com/media/23BST5FQOc8k8/giphy.gif' } } },
  { id: '8', title: 'Yes', images: { fixed_height: { url: 'https://media.giphy.com/media/nFjDu1LjEADh6/giphy.gif' } } },
  { id: '9', title: 'Wow', images: { fixed_height: { url: 'https://media.giphy.com/media/L0qTl8hl84AQg/giphy.gif' } } },
];

async function searchGifs(query, offset = 0) {
  try {
    const base = query
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&offset=${offset}&rating=g`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&offset=${offset}&rating=g`;
    const res = await fetch(base);
    const json = await res.json();
    if (json.data && json.data.length > 0) return json.data;
    throw new Error("Empty or failed");
  } catch (err) {
    // Return fallback GIFs if API is rate limited or banned
    return FALLBACK_GIFS.filter(g => query ? g.title.toLowerCase().includes(query.toLowerCase()) : true);
  }
}

export default function GifPickerModal({ visible, onClose, onSelectGif, colors }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const loadGifs = useCallback(async (q) => {
    setLoading(true);
    setError(null);
    try {
      const results = await searchGifs(q);
      setGifs(results);
    } catch (e) {
      setError('Failed to load GIFs. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) loadGifs('');
  }, [visible, loadGifs]);

  const handleQueryChange = (text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadGifs(text), 500);
  };

  const handleSelect = (gif) => {
    const url = gif.images?.fixed_height?.url || gif.images?.original?.url;
    if (!url) return;
    onSelectGif({
      url,
      name: gif.title || 'gif.gif',
      mimeType: 'image/gif',
      isGif: true,
    });
    onClose();
  };

  const renderGif = ({ item }) => {
    const thumb = item.images?.fixed_height_small?.url || item.images?.fixed_height?.url;
    return (
      <TouchableOpacity
        onPress={() => handleSelect(item)}
        activeOpacity={0.75}
        style={styles.gifCell}
      >
        <Image
          source={{ uri: thumb }}
          style={[styles.gifImg, { width: ITEM_SIZE, height: ITEM_SIZE }]}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Add a GIF</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Search bar */}
        <View style={[styles.searchRow, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={[styles.searchBox, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
            <Search size={16} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search GIFs..."
              placeholderTextColor={colors.inputPlaceholder}
              value={query}
              onChangeText={handleQueryChange}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); loadGifs(''); }}>
                <X size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Powered by Giphy */}
        <View style={[styles.poweredRow, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[styles.poweredText, { color: colors.textTertiary }]}>Powered by GIPHY</Text>
        </View>

        {/* Grid */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.loadingBox}>
            <Smile size={40} color={colors.textTertiary} />
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(item) => item.id}
            renderItem={renderGif}
            numColumns={NUM_COLS}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.loadingBox}>
                <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                  No GIFs found for "{query}"
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: Platform.OS === 'ios' ? 44 : 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  poweredRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  poweredText: { fontSize: 10, fontStyle: 'italic' },
  grid: { padding: 16, gap: 4 },
  gifCell: { margin: 2, borderRadius: 6, overflow: 'hidden' },
  gifImg: { borderRadius: 6, backgroundColor: '#eee' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, gap: 12 },
  errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});
