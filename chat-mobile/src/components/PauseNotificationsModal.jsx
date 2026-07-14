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
import api from "../services/api";
import { X, Clock, Calendar } from "lucide-react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import logger from '../utils/logger';
import { formatMessageTime } from "../utils/dateUtils";

const PauseNotificationsModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('date');

  const durations = [
    { label: "30 minutes", value: 30 },
    { label: "1 hour", value: 60 },
    { label: "2 hours", value: 120 },
    { label: "8 hours", value: 480 },
    { label: "24 hours", value: 1440 },
    { label: "Until tomorrow", value: "tomorrow" },
    { label: "Custom time", value: "custom" },
  ];

  const handleSelect = async (duration) => {
    try {
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
        await api.put('/notifications/preferences/pause', {
          duration: minutes,
          resumeAt: new Date(Date.now() + minutes * 60000).toISOString(),
        });
      }
    } catch (err) {
      logger.error('Failed to pause notifications:', err);
      Alert.alert('Error', 'Could not pause notifications. Please try again.');
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
        await api.put('/notifications/preferences/pause', {
          duration: minutes,
          resumeAt: customDate.toISOString(),
        });
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
            <TouchableOpacity onPress={handleClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
                      <Text style={{ color: colors.inputText || colors.textPrimary, fontSize: 14 }}>
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
                      <Text style={{ color: colors.inputText || colors.textPrimary, fontSize: 14 }}>
                        {formatMessageTime(customDate)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.scheduleButton, { backgroundColor: colors.primary, alignItems: 'center' }]}
                  onPress={handleCustomSubmit}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    Set Custom Time
                  </Text>
                </TouchableOpacity>
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
      borderRadius: 16,
      ...(Platform.OS !== "web"
        ? {
            boxShadow: `0px 4px 12px ${colors.shadowLg}`,
            elevation: 8,
          }
        : {
            boxShadow: rnShadowToBoxShadow(
              "#000",
              { width: 0, height: 4 },
              0.2,
              12,
            ),
          }),
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
    },
    content: {
      paddingVertical: 8,
    },
    durationItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 14,
    },
    durationLabel: {
      fontSize: 16,
      fontWeight: "500",
    },
    customSection: {
      padding: 20,
    },
    customLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    dateInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    scheduleButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      marginTop: 8,
    },
  });

export default PauseNotificationsModal;
