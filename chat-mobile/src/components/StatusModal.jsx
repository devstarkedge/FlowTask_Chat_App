import React, { useState, useEffect } from "react";
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
import { useAuthStore } from "../stores/authStore";
import { usersAPI } from "../services/api";
import { X, Clock, Check } from "lucide-react-native";
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import logger from '../utils/logger';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import Button from './common/Button';
import IconButton from './common/IconButton';


const StatusModal = ({ visible, onClose, initialStatus }) => {
  const { colors } = useThemeStore();
  const [statusText, setStatusText] = useState(initialStatus?.text || "");
  const [selectedEmoji, setSelectedEmoji] = useState(initialStatus?.emoji || "");
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(null);
  const [expiration, setExpiration] = useState(initialStatus?.expiration || 60);

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

  useEffect(() => {
    if (visible) {
      const textVal = initialStatus?.text || "";
      const emojiVal = initialStatus?.emoji || "";
      
      let expVal = 60;
      if (initialStatus?.expiration !== undefined) {
        expVal = initialStatus.expiration;
      } else if (initialStatus?.expiresAt) {
        // If loaded from backend, convert expiresAt back to an approximation for UI, or just default
        const minutesLeft = Math.round((new Date(initialStatus.expiresAt).getTime() - Date.now()) / 60000);
        if (minutesLeft > 0) {
          if (minutesLeft <= 30) expVal = 30;
          else if (minutesLeft <= 60) expVal = 60;
          else if (minutesLeft <= 240) expVal = 240;
          else expVal = 'today';
        }
      }
      
      setStatusText(textVal);
      setSelectedEmoji(emojiVal);
      setExpiration(expVal);

      if (textVal) {
        const index = statusPresets.findIndex(
          (p) =>
            (p.label.toLowerCase() === textVal.toLowerCase() ||
              p.text.toLowerCase() === textVal.toLowerCase()) &&
            (p.emoji === emojiVal || !emojiVal)
        );
        setSelectedPresetIndex(index !== -1 ? index : null);
      } else {
        setSelectedPresetIndex(null);
      }
    }
  }, [visible, initialStatus]);

  const handleClose = () => {
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    onClose();
  };

  const handleSave = async () => {
    try {
      let durationInMinutes = null;
      if (typeof expiration === 'number') {
        durationInMinutes = expiration;
      } else if (expiration === 'today') {
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        durationInMinutes = Math.round((endOfDay.getTime() - now.getTime()) / 60000);
      } else if (expiration === 'week') {
        const now = new Date();
        const currentDay = now.getDay();
        const distance = 7 - currentDay;
        const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distance, 23, 59, 59, 999);
        durationInMinutes = Math.round((endOfWeek.getTime() - now.getTime()) / 60000);
      }

      const statusObj = {
        text: statusText.trim(),
        emoji: selectedEmoji || '💬',
        duration: durationInMinutes, // Backend expects 'duration' in minutes
        expiration: expiration, // For local cache UI
      };
      await usersAPI.setCustomStatus(statusObj);

      // Update local auth store so user state updates immediately across components
      const authState = useAuthStore.getState();
      if (authState.user && authState.updateUser) {
        authState.updateUser({
          customStatus: statusObj.text ? statusObj : null,
        });
      }
    } catch (err) {
      logger.error('Failed to set status:', err);
    }
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    onClose();
  };

  const handleClear = async () => {
    try {
      await usersAPI.setCustomStatus({ text: '', emoji: '', expiration: null });

      const authState = useAuthStore.getState();
      if (authState.user && authState.updateUser) {
        authState.updateUser({
          customStatus: null,
        });
      }
    } catch (err) {
      logger.error('Failed to clear status:', err);
    }
    setStatusText("");
    setSelectedEmoji("");
    setSelectedPresetIndex(null);
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
            <IconButton 
              icon={X}
              size={40}
              iconSize={24}
              variant="ghost"
              onPress={handleClose}
              style={{ marginRight: -8 }}
            />
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
                  onChangeText={(text) => {
                    setStatusText(text);
                    setSelectedPresetIndex(null);
                  }}
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
                    setStatusText(preset.label);
                    setSelectedPresetIndex(index);
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
                    style={[styles.presetLabel, { color: selectedPresetIndex === index ? colors.primary : colors.textPrimary }]}
                  >
                    {preset.label}
                  </Text>
                  {selectedPresetIndex === index && (
                    <Check size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />
                  )}
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
                  onPress={() => setExpiration(option.value)}
                  activeOpacity={0.7}
                >
                  <Clock size={18} color={expiration === option.value ? colors.primary : colors.textSecondary} />
                  <Text
                    style={[
                      styles.expirationLabel,
                      { color: expiration === option.value ? colors.primary : colors.textPrimary },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Button
                title="Clear status"
                variant="ghost"
                onPress={handleClear}
                style={[styles.button, styles.clearButton, { backgroundColor: colors.backgroundSecondary, borderColor: 'transparent' }]}
                textStyle={{ color: colors.textPrimary }}
              />
              <Button
                title="Save"
                variant="primary"
                onPress={handleSave}
                style={[styles.button, styles.saveButton]}
              />
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
