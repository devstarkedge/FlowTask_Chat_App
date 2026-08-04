import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Search, CircleChevronLeft, CircleChevronRight , X } from 'lucide-react-native';
import { useThemeStore } from '../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


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
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(8),
    width: '100%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: moderateScale(20),
    paddingHorizontal: moderateScale(10),
    borderWidth: 1,
    flexShrink: 1,
  },
  input: {
    flex: 1,
    fontSize: moderateScale(15),
    paddingVertical: moderateScale(6),
  },
  counter: {
    fontSize: moderateScale(12),
    minWidth: moderateScale(48),
    textAlign: 'center',
  },
  closeButton: {
    paddingLeft: moderateScale(8),
  },
});

export default SearchBar;
