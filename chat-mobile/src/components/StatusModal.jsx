import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
} from "react-native";
import AccessibleModal from "./AccessibleModal";
import { useThemeStore } from "../stores/themeStore";
import { usersAPI } from "../services/api";
import { X, Clock } from "lucide-react-native";
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import logger from '../utils/logger';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const StatusModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();
  const [statusText, setStatusText] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("");
  const [selectedExpiration, setSelectedExpiration] = useState(null);

  const statusPresets = [
    { emoji: "🟢", label: "Available", text: "Available" },
    { emoji: "🌴", label: "On Leave", text: "On Leave" },
    { emoji: "📞", label: "In Meeting", text: "In Meeting" },
    { emoji: "🏠", label: "Working Remote", text: "Working Remote" },
    { emoji: "🎧", label: "Focusing", text: "Focusing" },
    { emoji: "☕", label: "On Break", text: "On Break" },
    { emoji: "🚀", label: "Busy", text: "Busy" },
    { emoji: "🤒", label: "Sick", text: "Sick" },
  ];

  const expirationOptions = [
    { label: "30 minutes", value: 30 },
    { label: "1 hour", value: 60 },
    { label: "4 hours", value: 240 },
    { label: "Today", value: "today" },
    { label: "This week", value: "week" },
    { label: "Don't clear", value: null },
  ];

  const handleClose = () => {
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    onClose();
  };

  const styles = createStyles(colors);

  // Helper to determine if a preset is currently selected
  const isPresetSelected = (preset) => {
    return (
      (preset.emoji && preset.emoji === selectedEmoji) ||
      (preset.text && preset.text === statusText)
    );
  };

  return (
    <AccessibleModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <View
          style={[styles.modal, { backgroundColor: colors.background }]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Set a status
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Custom Status Input */}
            <View style={styles.section}>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.backgroundSecondary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={styles.emojiInput}>{selectedEmoji || "😊"}</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.textPrimary }]}
                  placeholder="What's your status?"
                  placeholderTextColor={colors.textTertiary}
                  value={statusText}
                  onChangeText={setStatusText}
                />
              </View>
            </View>

            {/* Presets */}
            <View style={styles.section}>
              <Text
                style={[styles.sectionTitle, { color: colors.textSecondary }]}
              >
                SUGGESTIONS
              </Text>
              {statusPresets.map((preset, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.presetItem}
                  onPress={() => {
                    setSelectedEmoji(preset.emoji);
                    setStatusText(preset.label); // use label for display consistency
                    setSelectedExpiration(null); // reset expiration on new preset
                  }}
                  activeOpacity={0.7}
                  style={[
                    styles.presetItem,
                    isPresetSelected(preset) && { backgroundColor: colors.backgroundSecondary },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  <Text
                    style={[styles.presetLabel, { color: colors.textPrimary }]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Expiration */}
            <View style={styles.section}>
              <Text
                style={[styles.sectionTitle, { color: colors.textSecondary }]}
              >
                CLEAR AFTER
              </Text>
              {expirationOptions.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.expirationItem}
                  onPress={() => {
                    setSelectedExpiration(option.value);
                  }}
                  activeOpacity={0.7}
                  style={[
                    styles.expirationItem,
                    selectedExpiration === option.value && { backgroundColor: colors.backgroundSecondary },
                  ]}
                  activeOpacity={0.7}
                >
                  <Clock size={18} color={colors.textSecondary} />
                  <Text
                    style={[
                      styles.expirationLabel,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.clearButton,
                  { backgroundColor: colors.backgroundSecondary },
                ]}
                onPress={async () => {
                  try {
                    await usersAPI.setCustomStatus({ text: '', emoji: '', expiration: null });
                  } catch (err) {
                    console.error('Failed to clear status:', err);
                  }
                  setStatusText("");
                  setSelectedEmoji("");
                  setSelectedExpiration(null);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.buttonText, { color: colors.textPrimary }]}
                >
                  Clear status
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.saveButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={async () => {
                  try {
                    await usersAPI.setCustomStatus({
                      text: statusText,
                      emoji: selectedEmoji || '😊',
                      expiration: selectedExpiration,
                    });
                  } catch (err) {
                    console.error('Failed to set status:', err);
                  }
                  if (Platform.OS === "web") {
                    document.activeElement?.blur();
                  }
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.buttonText, { color: colors.textInverse }]}
                >
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Pressable>
    </AccessibleModal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      alignItems: "center",
    },
    modal: {
      width: "90%",
      maxHeight: "80%",
      borderRadius: moderateScale(16),
      ...(Platform.OS !== "web"
        ? {
            boxShadow: `0px 4px 12px ${colors.shadowLg}`,
            elevation: 8,
          }
        : {
            boxShadow: rnShadowToBoxShadow(
              "#000",
              { width: scale(0), height: verticalScale(4) },
              0.2,
              12,
            ),
          }),
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: moderateScale(18),
      fontWeight: "700",
    },
    section: {
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
    },
    sectionTitle: {
      fontSize: moderateScale(11),
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: verticalScale(12),
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
      borderRadius: moderateScale(8),
      borderWidth: 1,
      gap: 12,
    },
    emojiInput: {
      fontSize: moderateScale(24),
    },
    textInput: {
      flex: 1,
      fontSize: moderateScale(16),
    },
    presetItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: verticalScale(12),
      gap: 12,
    },
    presetEmoji: {
      fontSize: moderateScale(20),
    },
    presetLabel: {
      fontSize: moderateScale(16),
      fontWeight: "500",
    },
    expirationItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: verticalScale(12),
      gap: 12,
    },
    expirationLabel: {
      fontSize: moderateScale(16),
      fontWeight: "500",
    },
    actions: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: scale(20),
      paddingBottom: verticalScale(20),
    },
    button: {
      flex: 1,
      paddingVertical: verticalScale(14),
      borderRadius: moderateScale(8),
      alignItems: "center",
    },
    clearButton: {},
    saveButton: {},
    bustatusCardText: {
        fontSize: moderateScale(15),
        fontWeight: "600",
      },
      statusExpiration: {
        fontSize: moderateScale(12),
        marginTop: verticalScale(4),
      },
  });

export default StatusModal;
