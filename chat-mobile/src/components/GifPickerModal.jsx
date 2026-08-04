/**
 * GifPickerModal — Full-screen GIPHY picker for the mobile chat app.
 *
 * Features:
 *  - Debounced search (400ms)
 *  - Trending GIFs by default
 *  - Category chip row (Trending / Reactions / Funny / Love / Animals / Sports / etc.)
 *  - 2-column responsive grid with loading skeletons
 *  - Infinite scroll / pagination via FlatList onEndReached
 *  - Empty state, error state, powered-by-GIPHY branding
 *
 * Props:
 *   visible       – boolean
 *   onClose       – () => void
 *   onSelectGif   – (gifData) => void  where gifData = { gifUrl, previewUrl, title, width, height }
 *   colors        – theme colors object
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Search, Smile, RefreshCw } from 'lucide-react-native';
import useGiphySearch from '../hooks/useGiphySearch';
import { GIF_CATEGORIES } from '../services/gifService';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const NUM_COLS = 2;
const GRID_PADDING = 12;
const CELL_GAP = 6;

// ─── Skeleton cell ────────────────────────────────────────────────────────────

function SkeletonCell({ colors, cellWidth }) {
  return (
    <View
      style={[
        styles.gifCell,
        {
          width: cellWidth,
          height: cellWidth * 0.75,
          backgroundColor: colors.backgroundSecondary || '#2a2a2a',
          opacity: 0.6,
        },
      ]}
    />
  );
}

// ─── GIF cell ─────────────────────────────────────────────────────────────────

const GifCell = React.memo(function GifCell({ item, onSelect, colors, cellWidth }) {
  const aspectRatio = item.width && item.height ? item.width / item.height : 3 / 2;
  const cellHeight = Math.round(cellWidth / aspectRatio);
  const uri = item.previewUrl || item.gifUrl;
  if (!uri) return null;

  return (
    <TouchableOpacity
      style={[styles.gifCell, { width: cellWidth, height: cellHeight }]}
      onPress={() => onSelect(item)}
      activeOpacity={0.75}
    >
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function GifPickerModal({  visible,
  onClose,
  onSelectGif,
  colors,
}) {
  const { width: screenWidth } = useWindowDimensions();
  const cellWidth = (screenWidth - GRID_PADDING * 2 - CELL_GAP) / NUM_COLS;
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const inputRef = useRef(null);

  // Search hook — query drives search, empty query uses category
  const { gifs, isLoading, isLoadingMore, hasMore, error, loadMore, reset } =
    useGiphySearch(query, query ? null : activeCategory);

  // Reset on open/close
  useEffect(() => {
    if (visible) {
      setQuery('');
      setActiveCategory('trending');
      reset();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(
    (gif) => {
      if (!gif.gifUrl) return; // guard against null URLs from provider
      onSelectGif({
        provider: gif.provider || 'giphy',
        providerId: gif.providerId || gif.id,
        gifUrl: gif.gifUrl,
        previewUrl: gif.previewUrl,
        title: gif.title,
        width: gif.width,
        height: gif.height,
      });
      onClose();
    },
    [onSelectGif, onClose],
  );

  const handleCategorySelect = useCallback((catId) => {
    setActiveCategory(catId);
    setQuery('');
  }, []);

  const handleClearQuery = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const skeletonData = Array.from({ length: 8 }, (_, i) => ({ id: `sk-${i}`, _skeleton: true }));

  const renderItem = useCallback(
    ({ item }) => {
      if (item._skeleton)
        return <SkeletonCell key={item.id} colors={colors} cellWidth={cellWidth} />;
      return <GifCell item={item} onSelect={handleSelect} colors={colors} cellWidth={cellWidth} />;
    },
    [handleSelect, colors, cellWidth],
  );

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [isLoadingMore, colors]);

  const displayData = isLoading ? skeletonData : gifs;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Add a GIF</Text>
          <View style={{ width: scale(36) }} />
        </View>

        {/* ── Search bar ── */}
        <View style={[styles.searchRow, { backgroundColor: colors.backgroundSecondary || colors.card }]}>
          <View
            style={[
              styles.searchBox,
              { backgroundColor: colors.inputBackground, borderColor: colors.border },
            ]}
          >
            <Search size={15} color={colors.textTertiary} />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search GIPHY..."
              placeholderTextColor={colors.inputPlaceholder}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="never"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClearQuery} hitSlop={{ top: verticalScale(8), bottom: verticalScale(8), left: scale(8), right: scale(8) }}>
                <X size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Category chips ── */}
        {!query && (
          <View style={[styles.categoryRow, { borderBottomColor: colors.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryList}
            >
              {GIF_CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isActive ? colors.primary : colors.inputBackground,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleCategorySelect(cat.id)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.categoryLabel,
                        { color: isActive ? '#fff' : colors.textSecondary },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Grid ── */}
        {error && !isLoading ? (
          <View style={styles.centerBox}>
            <Smile size={48} color={colors.textTertiary} />
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: colors.primary }]}
              onPress={reset}
            >
              <RefreshCw size={14} color={colors.primary} />
              <Text style={[styles.retryLabel, { color: colors.primary }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={displayData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={NUM_COLS}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.columnWrapper}
            showsVerticalScrollIndicator={false}
            onEndReached={hasMore && !isLoading ? loadMore : undefined}
            onEndReachedThreshold={0.4}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.centerBox}>
                  <Smile size={48} color={colors.textTertiary} />
                  <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                    {query ? `No GIFs found for "${query}"` : 'No GIFs available'}
                  </Text>
                </View>
              ) : null
            }
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== 'web'}
          />
        )}

        {/* ── Powered by GIPHY ── */}
        <View style={[styles.poweredRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.poweredText, { color: colors.textTertiary }]}>
            Powered by GIPHY
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { padding: moderateScale(4) },
  title: { fontSize: moderateScale(17), fontWeight: '700' },
  searchRow: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(10),
    borderWidth: 1,
    paddingHorizontal: scale(10),
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(15),
    paddingVertical: verticalScale(0),
  },
  categoryRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: verticalScale(8),
  },
  categoryList: {
    paddingHorizontal: scale(12),
    gap: 8,
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(16),
    borderWidth: 1,
  },
  categoryLabel: {
    fontSize: moderateScale(13),
    fontWeight: '500',
  },
  grid: {
    padding: GRID_PADDING,
  },
  columnWrapper: {
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  gifCell: {
    borderRadius: moderateScale(8),
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: verticalScale(60),
    gap: 12,
    paddingHorizontal: scale(32),
  },
  errorText: {
    fontSize: moderateScale(14),
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    marginTop: verticalScale(4),
  },
  retryLabel: {
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: verticalScale(16),
    alignItems: 'center',
  },
  poweredRow: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(8),
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  poweredText: { fontSize: moderateScale(11), fontStyle: 'italic' },
});
