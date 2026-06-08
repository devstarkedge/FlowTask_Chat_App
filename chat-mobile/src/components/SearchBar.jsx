import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Search, CircleChevronLeft, CircleChevronRight , X } from 'lucide-react-native';
import { useThemeStore } from '../stores/themeStore';

const SearchBar = ({ query, onChangeQuery, onClose, onNext, onPrev, currentIndex, total }) => {
  const { colors } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.inner, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}><Search size={18} color={colors.textSecondary} /><TextInput
          style={[styles.input, { color: colors.inputText }]}
          placeholder="Search messages..."
          placeholderTextColor={colors.inputPlaceholder}
          value={query}
          onChangeText={onChangeQuery}
          returnKeyType="search"
        /><TouchableOpacity onPress={onPrev} disabled={total === 0}><CircleChevronLeft size={18} color={colors.textSecondary} /></TouchableOpacity><Text style={[styles.counter, { color: colors.textSecondary }]}>{total > 0 ? `${(currentIndex ?? 0) + 1}/${total}` : '0/0'}</Text><TouchableOpacity onPress={onNext} disabled={total === 0}><CircleChevronRight  size={18} color={colors.textSecondary} /></TouchableOpacity><TouchableOpacity onPress={onClose} style={styles.closeButton}><X size={18} color={colors.textSecondary} /></TouchableOpacity></View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
  },
  counter: {
    fontSize: 12,
    minWidth: 48,
    textAlign: 'center',
  },
  closeButton: {
    paddingLeft: 8,
  },
});

export default SearchBar;
