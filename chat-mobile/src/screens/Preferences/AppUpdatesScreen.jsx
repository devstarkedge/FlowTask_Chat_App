import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useThemeStore } from '../../stores/themeStore';
import { useUpdateStore } from '../../stores/updateStore';
import AboutUpdateSection from '../../components/updates/AboutUpdateSection';
import { scale, moderateScale, verticalScale } from '../../utils/responsive';

export default function AppUpdatesScreen({ navigation }) {
  const { colors, effectiveTheme } = useThemeStore();

  useEffect(() => {
    useUpdateStore.getState().initUpdater();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back to preferences"
        >
          <ChevronLeft size={28} color={colors.textPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>App Updates</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AboutUpdateSection />
      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: moderateScale(4),
    marginLeft: scale(-4),
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  headerRight: {
    width: scale(36),
  },
  content: {
    paddingHorizontal: scale(16),
    paddingTop: verticalScale(16),
  },
});
