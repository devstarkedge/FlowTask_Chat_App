import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import AccessibleModal from "./AccessibleModal";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore } from "../stores/authStore";
import api, { usersAPI } from "../services/api";
import { X, Clock, Calendar } from "lucide-react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import logger from '../utils/logger';
import { formatMessageTime } from "../utils/dateUtils";
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import Button from './common/Button';
import IconButton from './common/IconButton';

const PauseNotificationsModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();
  const { user, updateUser } = useAuthStore();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('date');

  const isPaused = user?.notificationsPausedUntil && new Date(user.notificationsPausedUntil) > new Date();

  const allDurations = [
    { label: "Continue Notifications", value: "continue" },
    { label: "30 minutes", value: 30 },
    { label: "1 hour", value: 60 },
    { label: "2 hours", value: 120 },
    { label: "8 hours", value: 480 },
    { label: "24 hours", value: 1440 },
    { label: "Until tomorrow", value: "tomorrow" },
    { label: "Custom time", value: "custom" },
  ];

  const durations = isPaused ? allDurations : allDurations.filter(d => d.value !== "continue");

  const handleSelect = async (duration) => {
    try {
      if (duration.value === 'continue') {
        await usersAPI.resumeNotifications();
        updateUser({ notificationsPausedUntil: null });
      } else {
        // Compute pause duration in minutes
        let minutes = typeof duration.value === 'number' ? duration.value : null;
        if (duration.value === 'tomorrow') {
          // Until tomorrow = ~16 hours from now (until 8am)
          const now = new Date();
          const tomorrow = new Date(now);
          tomorrow.setHours(8, 0, 0, 0);
          if (tomorrow <= now) tomorrow.setDate(tomorrow.getDate() + 1);
          minutes = Math.ceil((tomorrow - now) / 60000);
        }
        if (duration.value === 'custom') {
          setShowCustomPicker(true);
          return;
        }

        if (minutes) {
          const resumeAt = new Date(Date.now() + minutes * 60000).toISOString();
          await usersAPI.pauseNotifications({
            duration: minutes,
            resumeAt,
          });
          updateUser({ notificationsPausedUntil: resumeAt });
        }
      }
    } catch (err) {
      logger.error('Failed to update notifications:', err);
      Alert.alert('Error', 'Could not update notifications. Please try again.');
    }
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    onClose();
  };

  const handleCustomSubmit = async () => {
    if (!customDate || isNaN(customDate.getTime()) || customDate <= new Date()) return;
    try {
      const minutes = Math.ceil((customDate - new Date()) / 60000);
      if (minutes > 0) {
        const resumeAt = customDate.toISOString();
        await usersAPI.pauseNotifications({
          duration: minutes,
          resumeAt,
        });
        updateUser({ notificationsPausedUntil: resumeAt });
      }
    } catch (err) {
      logger.error('Failed to pause notifications:', err);
      Alert.alert('Error', 'Could not pause notifications. Please try again.');
    }
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    setShowCustomPicker(false);
    onClose();
  };

  const handleClose = () => {
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    setShowCustomPicker(false);
    onClose();
  };

  const styles = createStyles(colors);

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
              Pause notifications
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

          {/* Duration Options or Custom Picker */}
          {!showCustomPicker ? (
            <View style={styles.content}>
              {durations.map((duration, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.durationItem,
                    index < durations.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                  onPress={() => handleSelect(duration)}
                  activeOpacity={0.7}
                >
                  <Clock size={20} color={colors.textSecondary} />
                  <Text
                    style={[styles.durationLabel, { color: colors.textPrimary }]}
                  >
                    {duration.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={[styles.customSection, { borderTopColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: verticalScale(12) }}>
                <Calendar size={16} color={colors.textSecondary} />
                <Text style={[styles.customLabel, { color: colors.textSecondary }]}>
                  Custom date & time
                </Text>
              </View>
              <View style={{ flexDirection: 'column', gap: 12 }}>
                {Platform.OS === 'ios' ? (
                  <View style={{ alignItems: 'flex-start' }}>
                    <DateTimePicker
                      value={customDate}
                      mode="datetime"
                      display="default"
                      minimumDate={new Date()}
                      onChange={(event, selectedDate) => {
                        if (selectedDate) setCustomDate(selectedDate);
                      }}
                    />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                      onPress={() => {
                        setPickerMode('date');
                        setShowPicker(true);
                      }}
                    >
                      <Text style={{ color: colors.inputText || colors.textPrimary, fontSize: moderateScale(14) }}>
                        {customDate.toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dateInput, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                      onPress={() => {
                        setPickerMode('time');
                        setShowPicker(true);
                      }}
                    >
                      <Text style={{ color: colors.inputText || colors.textPrimary, fontSize: moderateScale(14) }}>
                        {formatMessageTime(customDate)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                <Button
                  title="Set Custom Time"
                  variant="primary"
                  onPress={handleCustomSubmit}
                  style={styles.scheduleButton}
                  fullWidth
                />
              </View>

              {Platform.OS === 'android' && showPicker && (
                <DateTimePicker
                  value={customDate}
                  mode={pickerMode}
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event, selectedDate) => {
                    setShowPicker(false);
                    if (selectedDate) {
                      setCustomDate(selectedDate);
                      if (pickerMode === 'date') {
                        setTimeout(() => {
                          setPickerMode('time');
                          setShowPicker(true);
                        }, 100);
                      }
                    }
                  }}
                />
              )}
            </View>
          )}
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
      width: "85%",
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
    content: {
      paddingVertical: verticalScale(8),
    },
    durationItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      gap: 14,
    },
    durationLabel: {
      fontSize: moderateScale(16),
      fontWeight: "500",
    },
    customSection: {
      padding: moderateScale(20),
    },
    customLabel: {
      fontSize: moderateScale(14),
      fontWeight: '600',
    },
    dateInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: moderateScale(8),
      paddingHorizontal: scale(12),
      paddingVertical: verticalScale(10),
    },
    scheduleButton: {
      paddingHorizontal: scale(16),
      paddingVertical: verticalScale(12),
      borderRadius: moderateScale(8),
      marginTop: verticalScale(8),
    },
  });

export default PauseNotificationsModal;
