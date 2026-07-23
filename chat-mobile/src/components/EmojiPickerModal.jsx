/**
 * EmojiPickerModal — Full emoji library picker with categories, search,
 * recently used, and tabs. Works consistently on Android & iOS.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, Search } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreferencesStore } from '../stores/preferencesStore';
import { applySkinTone } from '../utils/emojiUtils';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';


// Comprehensive categorized emoji dataset matching emoji-picker-react categories
const EMOJI_CATEGORIES = [
  {
    key: 'smileys_people',
    label: 'Smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸'
    ]
  },
  {
    key: 'animals_nature',
    label: 'Nature',
    icon: '🐻',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦢', '🦅', '🦉', '🦤', '🦩', '🦚', ' parrot', '🦧', '🦍', '🐕', '🐈', '🐈‍⬛', '🐇', '🐹', '🐿️', '🦫', '🦬', '🐃', '🐂', '🐄', '🐏', '🐑', '🐐', '🦌', '🐎', '🦄', '🐆', '🐅', '🐃', '🐘', '🦣', '🦏', '🦛', '🐪', '🐫', '🦙', '🦒', '🦘', '🦬', '🐃', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🐈', '🐈‍⬛', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🐇', '🐿️', '🦫', '🦔', '🦇', '🐻', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🐉', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃'
    ]
  },
  {
    key: 'food_drink',
    label: 'Food',
    icon: '🍔',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', ' waffle', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦀', '🦞', '🦐', '🦑', '🦪', '🍨', '🍧', '🍦', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵', '🍶', '🥂', '🍷', '🍸', '🍹', '🍺', '🍻', '🥃', '🥤', '🧃', '🧉', '🧊'
    ]
  },
  {
    key: 'activities',
    label: 'Activity',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '📯', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🏋️', '🤺', '🤼', '🤸', '⛹️', '🤾', '🧗', '🧘', '🚴', '🚵', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎫', '🎟️', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🎮', '🕹️', '👾', '🎲', '🎯', '🎳'
    ]
  },
  {
    key: 'travel_places',
    label: 'Travel',
    icon: '🚗',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🚲', '🛴', '🛹', '🛺', '🏍️', '🛵', '🚂', '🚊', '🚇', '🚄', '🚀', '🛸', '🚁', '✈️', '🛶', '⛵', '🛥️', '🚢', '⚓', '⛽', '🗺️', '🧭', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️', '🏜️', '🏝️', '🌌', '🏙️', '🌆', '🌇', '🎆', '🎇', '🎡', '🎢', '⛲', '🏯', '🏰'
    ]
  },
  {
    key: 'objects',
    label: 'Objects',
    icon: '💡',
    emojis: [
      '⌚', '📱', '📲', '💻', ' Keyboard', ' Mouse', '🖨️', '🖥️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '电视', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '⏳', '🔌', '🔋', ' Candle', '💡', ' Flashlight', ' Lantern', '💵', '🪙', '💸', '💳', '🧾', '💎', '⚖️', '🧱', '⚙️', '🔧', '🔨', '🛠️', '⛏️', '🪓', '🔩', '🪜', '⛓️', '🧲', '🧪', '🧫', '🔬', ' Telescope', ' Satellite', '💉', '🩺', ' Pill', '🩹', ' Notepad', ' Pencil', ' Folder', ' Calendar', ' Window', '🔑', '🗝️', ' Door', ' Couch', ' Bed', ' Shower', ' Toilet', ' Broom', ' Sponge', ' Soap', ' Toothbrush', '🧯', '🛒', '🚬', ' Coffin', ' Urn', '🏺'
    ]
  },
  {
    key: 'symbols',
    label: 'Symbols',
    icon: '💖',
    emojis: [
      '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💯', '💢', '💬', '💭', '🗯️', '💤', '🌐', '🌀', '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🔀', '🔁', '🔂', '▶️', '⏩', '◀️', '⏪', '🔼', '🔽', '⏹️', '⏏️', '🎦', '📶', '📳', '📴', '♀️', '♂️', '⚧️', '✖️', '➕', '➖', '➗', '♾️', '❓', '❔', '❕', '❗', '〰️', '💱', '💲', '⚕️', '♻️', '⚜️', '🔱', '📛', '🔰', '⭕', '✅', '☑️', '✔️', '❌', '❎', '➿', '〽️', '✳️', '✴️', '❇️', '🔘', '⚪', '⚫', '🔴', '🔵', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷'
    ]
  },
  {
    key: 'flags',
    label: 'Flags',
    icon: '🎌',
    emojis: [
      '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇦🇨', '🇦🇩', '🇦🇪', '🇦🇫', '🇦🇬', '🇦🇮', '🇦🇱', '🇦🇲', '🇦🇴', '🇦🇶', '🇦🇷', '🇦🇸', '🇦🇹', '🇦🇺', '🇦🇼', '🇦🇽', '🇦🇿', '🇧🇦', '🇧🇧', '🇧🇩', '🇧🇪', '🇧🇫', '🇧🇬', '🇧🇭', '🇧🇮', '🇧🇯', '🇧🇱', '🇧🇲', '🇧🇳', '🇧🇴', '🇧🇶', '🇧🇷', '🇧🇸', '🇧🇹', '🇧🇻', '🇧🇼', '🇧🇾', '🇧🇿', '🇨🇦', '🇨🇨', '🇨🇩', '🇨🇫', '🇨🇬', '🇨🇭', '🇨🇮', '🇨🇰', '🇨🇱', '🇨🇲', '🇨🇳', '🇨🇴', '🇨🇵', '🇨🇷', '🇨🇺', '🇨🇻', '🇨🇼', '🇨🇽', '🇨🇾', '🇨🇿', '🇩🇪', '🇩🇬', '🇩🇯', '🇩🇰', '🇩🇲', '🇩🇴', '🇩🇿', '🇪🇦', '🇪🇨', '🇪🇪', '🇪🇬', '🇪🇭', '🇪🇷', '🇪🇸', '🇪🇹', '🇪🇺', '🇫🇮', '🇫🇯', '🇫🇰', '🇫🇲', '🇫🇴', '🇫🇷', '🇬🇦', '🇬🇧', '🇬🇩', '🇬🇪', '🇬🇫', '🇬🇬', '🇬🇭', '🇬🇮', '🇬🇱', '🇬🇲', '🇬🇳', '🇬🇵', '🇬🇶', '🇬🇷', '🇬🇸', '🇬🇹', '🇬🇺', '🇬🇼', '🇬🇾', '🇭🇰', '🇭🇲', '🇭🇳', '🇭🇷', '🇭🇹', '🇭🇺', '🇮🇨', '🇮🇩', '🇮🇪', '🇮🇱', '🇮🇲', '🇮🇳', '🇮🇴', '🇮🇶', '🇮🇷', '🇮🇸', '🇮🇹', '🇯🇪', '🇯🇲', '🇯🇴', '🇯🇵', '🇰🇪', '🇰🇬', '🇰🇭', '🇰🇮', '🇰🇲', '🇰🇳', '🇰🇵', '🇰🇷', '🇰🇼', '🇰🇾', '🇰🇿', '🇱🇦', '🇱🇧', '🇱🇨', '🇱🇮', '🇱🇰', '🇱🇷', '🇱🇸', '🇱🇹', '🇱🇺', '🇱🇻', '🇱🇾', '🇲🇦', '🇲🇨', '🇲🇩', '🇲🇪', '🇲🇫', '🇲🇬', '🇲🇭', '🇲🇰', '🇲🇱', '🇲🇲', '🇲🇳', '🇲🇴', '🇲🇵', '🇲🇶', '🇲🇷', '🇲🇸', '🇲🇹', '🇲🇺', '🇲🇻', '🇲🇼', '🇲🇽', '🇲🇾', '🇲🇿', '🇳🇦', '🇳🇨', '🇳🇪', '🇳🇫', '🇳🇬', '🇳🇮', '🇳🇱', '🇳🇴', '🇳🇵', '🇳🇷', '🇳🇺', '🇳🇿', '🇴🇲', '🇵🇦', '🇵🇪', '🇵🇫', '🇵🇬', '🇵🇭', '🇵🇰', '🇵🇱', '🇵🇲', '🇵🇳', '🇵🇷', '🇵🇸', '🇵🇹', '🇵🇼', '🇵🇾', '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇸', '🇷🇺', '🇷🇼', '🇸🇦', '🇸🇧', '🇸🇨', '🇸🇩', '🇸🇪', '🇸🇬', '🇸🇭', '🇸🇮', '🇸🇯', '🇸🇰', '🇸🇱', '🇸🇲', '🇸🇳', '🇸🇴', '🇸🇷', '🇸🇸', '🇸🇹', '🇸🇻', '🇸🇽', '🇸🇾', '🇸🇿', '🇹🇦', '🇹🇨', '🇹🇩', '🇹🇫', '🇹🇬', '🇹🇭', '🇹🇯', '🇹🇰', '🇹🇱', '🇹🇲', '🇹🇳', '🇹🇴', '🇹🇷', '🇹🇹', '🇹🇻', '🇹🇼', '🇹🇿', '🇺🇦', '🇺🇬', '🇺🇲', '🇺🇳', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇦', '🇻🇨', '🇻🇪', '🇻🇬', '🇻🇮', '🇻🇳', '🇻🇺', '🇼🇫', '🇩🇿', '🇦🇴', '🇲🇦', '🇿🇦', '🇿🇲', '🇿🇼'
    ]
  }
];

const ASYNC_RECENT_KEY = '@flowtask/recent_emojis';
const POPULAR_DEFAULT = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'];

const EmojiItem = React.memo(({ emoji, onPress, skinTone }) => {
  const modifiedEmoji = applySkinTone(emoji, skinTone);
  return (
    <TouchableOpacity
      style={styles.emojiButton}
      onPress={() => onPress(modifiedEmoji)}
      activeOpacity={0.5}
    >
      <Text style={styles.emojiText}>{modifiedEmoji}</Text>
    </TouchableOpacity>
  );
});

export default function EmojiPickerModal({ visible, onClose, onSelect, colors }) {
  const { isTablet, isDesktop, width } = useResponsive();
  const isWide = isTablet || isDesktop || width > 640;
  const numColumns = isWide ? 10 : 8;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('smileys_people');
  const [recentEmojis, setRecentEmojis] = useState(POPULAR_DEFAULT);
  const { emojiSkinTone } = usePreferencesStore();

  // Load recents on mount
  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(ASYNC_RECENT_KEY)
        .then((stored) => {
          if (stored) {
            setRecentEmojis(JSON.parse(stored));
          }
        })
        .catch(() => {});
    }
  }, [visible]);

  // Handle emoji selection and track recents
  const handleSelect = useCallback(async (emoji) => {
    onSelect?.(emoji);
    onClose?.();

    // Track recently used
    try {
      const nextRecent = [emoji, ...recentEmojis.filter(x => x !== emoji)].slice(0, 24);
      setRecentEmojis(nextRecent);
      await AsyncStorage.setItem(ASYNC_RECENT_KEY, JSON.stringify(nextRecent));
    } catch (_) {}
  }, [onSelect, onClose, recentEmojis]);

  // Search filter
  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.trim().toLowerCase();
    const matches = [];
    for (const cat of EMOJI_CATEGORIES) {
      for (const emoji of cat.emojis) {
        // Quick visual/name heuristics
        if (emoji.includes(query) || emoji) {
          matches.push(emoji);
        }
      }
    }
    // Simple filter to return unique matches
    return Array.from(new Set(matches)).slice(0, 100);
  }, [searchQuery]);

  // Categories list including Recents
  const categoriesList = useMemo(() => {
    return [
      { key: 'recent', label: 'Recent', icon: '🕒' },
      ...EMOJI_CATEGORIES
    ];
  }, []);

  const activeCategoryData = useMemo(() => {
    if (activeCategory === 'recent') {
      return recentEmojis;
    }
    return EMOJI_CATEGORIES.find(c => c.key === activeCategory)?.emojis || [];
  }, [activeCategory, recentEmojis]);

  const renderCategoryItem = ({ item }) => (
    <EmojiItem emoji={item} onPress={handleSelect} skinTone={emojiSkinTone} />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={[styles.overlay, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.container,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
            isWide && styles.wideContainer,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Add Reaction
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={[styles.searchContainer, { backgroundColor: colors.backgroundSecondary || colors.background }]}>
            <Search size={16} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search emoji..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
                <X size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Tabs (Horizontal Scroll) */}
          {!searchQuery.trim() && (
            <View style={[styles.tabsWrapper, { borderBottomColor: colors.border }]}>
              <FlatList
                horizontal
                data={categoriesList}
                keyExtractor={(item) => item.key}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabsContainer}
                renderItem={({ item }) => {
                  const isActive = activeCategory === item.key;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.tabButton,
                        isActive && { borderBottomColor: colors.primary }
                      ]}
                      onPress={() => setActiveCategory(item.key)}
                    >
                      <Text style={[
                        styles.tabLabel,
                        { color: isActive ? colors.primary : colors.textSecondary, fontSize: moderateScale(18) }
                      ]}>
                        {item.icon}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}

          {/* Emojis Grid */}
          <View style={styles.gridContainer}>
            <FlatList
              key={numColumns}
              data={searchQuery.trim() ? filteredEmojis : activeCategoryData}
              numColumns={numColumns}
              keyExtractor={(item, index) => `${item}-${index}`}
              renderItem={renderCategoryItem}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={true}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No emojis found
                  </Text>
                </View>
              }
            />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: scale(400),
    height: verticalScale(420),
    borderRadius: moderateScale(20),
    borderWidth: 1,
    paddingBottom: verticalScale(12),
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: verticalScale(10) },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  wideContainer: {
    maxWidth: 560,
    height: 480,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  closeButton: {
    padding: moderateScale(4),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: moderateScale(12),
    paddingHorizontal: scale(12),
    borderRadius: moderateScale(10),
    height: verticalScale(38),
  },
  searchIcon: {
    marginRight: scale(8),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(15),
    paddingVertical: verticalScale(6),
    height: '100%',
  },
  clearSearchButton: {
    padding: moderateScale(4),
  },
  tabsWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsContainer: {
    paddingHorizontal: scale(8),
  },
  tabButton: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: moderateScale(13),
    fontWeight: '600',
  },
  gridContainer: {
    flex: 1,
    minHeight: verticalScale(250),
  },
  grid: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(8),
    paddingBottom: verticalScale(24),
  },
  emojiButton: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '12.5%',
    marginVertical: verticalScale(4),
  },
  emojiText: {
    fontSize: moderateScale(26),
  },
  emptyContainer: {
    paddingVertical: verticalScale(40),
    alignItems: 'center',
  },
  emptyText: {
    fontSize: moderateScale(14),
  },
});
