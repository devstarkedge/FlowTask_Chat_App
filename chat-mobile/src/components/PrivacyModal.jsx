import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeStore } from '../stores/themeStore';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { PRIVACY_LAST_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS } from '../data/privacyContent';

/**
 * PrivacyModal — scrollable viewer for the TaskChat Privacy Policy,
 * opened from the registration screen and preferences.
 */
const PrivacyModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();
  const styles = createStyles(colors);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>TaskChat — Privacy Policy</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Close Privacy Policy"
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
          >
            {PRIVACY_INTRO.map((text, i) => (
              <Text key={`intro-${i}`} style={styles.paragraph}>
                {text}
              </Text>
            ))}

            {PRIVACY_SECTIONS.map(({ heading, blocks }) => (
              <View key={heading} style={styles.section}>
                <Text style={styles.heading}>{heading}</Text>
                {blocks.map((block, bi) => {
                  if (block.type === 'ul') {
                    return (
                      <View key={bi} style={styles.list}>
                        {block.items.map((item, ii) => (
                          <View key={ii} style={styles.listItem}>
                            <Text style={styles.bullet}>•</Text>
                            <Text style={styles.listText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  }
                  return (
                    <Text key={bi} style={styles.paragraph}>
                      {block.text}
                    </Text>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.primary }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(9,9,11,0.62)',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '92%',
      borderTopLeftRadius: moderateScale(18),
      borderTopRightRadius: moderateScale(18),
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: scale(18),
      paddingVertical: verticalScale(14),
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTextWrap: { flex: 1 },
    title: {
      fontSize: moderateScale(15),
      fontWeight: '800',
      letterSpacing: -0.3,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: moderateScale(12),
      marginTop: verticalScale(2),
      color: colors.textTertiary,
    },
    closeButton: {
      width: scale(32),
      height: verticalScale(32),
      borderRadius: moderateScale(9),
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flexShrink: 1,
      paddingHorizontal: scale(18),
    },
    bodyContent: {
      paddingVertical: verticalScale(16),
    },
    section: { marginTop: verticalScale(14) },
    heading: {
      fontSize: moderateScale(14),
      fontWeight: '700',
      marginBottom: verticalScale(6),
      color: colors.textPrimary,
    },
    paragraph: {
      fontSize: moderateScale(13),
      lineHeight: moderateScale(20),
      marginBottom: verticalScale(8),
      color: colors.textSecondary,
    },
    list: { marginBottom: verticalScale(8) },
    listItem: {
      flexDirection: 'row',
      marginBottom: verticalScale(4),
    },
    bullet: {
      width: scale(16),
      fontSize: moderateScale(13),
      lineHeight: moderateScale(20),
      color: colors.textSecondary,
    },
    listText: {
      flex: 1,
      fontSize: moderateScale(13),
      lineHeight: moderateScale(20),
      color: colors.textSecondary,
    },
    doneButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: verticalScale(14),
      paddingHorizontal: scale(18),
      margin: scale(16),
      marginTop: verticalScale(8),
      borderRadius: moderateScale(11),
    },
    doneButtonText: {
      fontSize: moderateScale(14),
      fontWeight: '700',
      letterSpacing: -0.3,
      color: colors.messageTextSent,
    },
  });

export default PrivacyModal;
