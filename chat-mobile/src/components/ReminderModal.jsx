/**
 * ReminderModal — set reminders on saved messages.
 *
 * Quick options: 20min, 1hr, 3hr, Tomorrow 9AM, Next week.
 * Custom date/time option.
 *
 * Props:
 *   visible     – boolean
 *   onClose     – () => void
 *   onSetReminder – (reminderAt: string ISO) => void
 *   colors      – theme colors
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  c
} from 'react-native';
import { X, Clock, Bell, Calendar, Repeat as RepeatIcon, ChevronLeft} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatMessageTime } from '../utils/dateUtils';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import Button from './common/Button';
import IconButton from './common/IconButton';


const RECURRENCE_OPTIONS = ['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'];

function getQuickOptions() {
  const now = new Date();
  const options = [];

  // 20 minutes
  const in20 = new Date(now.getTime() + 20 * 60 * 1000);
  options.push({ label: 'In 20 minutes', icon: Clock, date: in20.toISOString() });

  // 1 hour
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  options.push({ label: 'In 1 hour', icon: Clock, date: in1h.toISOString() });

  // 3 hours
  const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  options.push({ label: 'In 3 hours', icon: Clock, date: in3h.toISOString() });

  // Tomorrow 9 AM
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  options.push({ label: 'Tomorrow at 9:00 AM', icon: Bell, date: tomorrow.toISOString() });

  // Next week (Monday 9 AM)
  const nextWeek = new Date(now);
  const daysUntilMonday = (8 - nextWeek.getDay()) % 7 || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(9, 0, 0, 0);
  options.push({ label: 'Next Monday at 9:00 AM', icon: Calendar, date: nextWeek.toISOString() });

  return options;
}



const ReminderModal = React.memo(function ReminderModal({
  visible,
  onClose,
  onSetReminder,
  colors,
  hasReminder,
}) {
  const quickOptions = useMemo(() => getQuickOptions(), [visible]);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState(new Date());
  const [recurrence, setRecurrence] = useState('None');
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);

  const handleCustomSubmit = () => {
    if (customDate <= new Date()) return;
    onSetReminder(customDate.toISOString(), recurrence);
    setShowCustom(false);
    onClose();
  };

  const handleDateChange = (event, selectedDate) => {
    if (selectedDate) {
      setCustomDate(selectedDate);
    }
  };

  const handleQuickSelect = (date) => {
    onSetReminder(date, 'None');
    onClose();
  };

  const [showAndroidDatePicker, setShowAndroidDatePicker] = useState(false);
  const [showAndroidTimePicker, setShowAndroidTimePicker] = useState(false);

  const openCustomPicker = () => {
    setShowCustom(true);
  };

  const handleAndroidDateChange = (event, selectedDate) => {
    setShowAndroidDatePicker(false);
    if (selectedDate) setCustomDate(selectedDate);
  };

  const handleAndroidTimeChange = (event, selectedTime) => {
    setShowAndroidTimePicker(false);
    if (selectedTime) setCustomDate(selectedTime);
  };

  // Reset view when modal closes
  React.useEffect(() => {
    if (!visible) setShowCustom(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[styles.overlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.container, {
            backgroundColor: colors.background,
            borderColor: colors.border,
          }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Bell size={18} color={colors.primary} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Set Reminder
              </Text>
            </View>
            <IconButton 
              icon={X}
              size={40}
              iconSize={20}
              variant="ghost"
              onPress={onClose}
              style={{ marginRight: -4 }}
            />
          </View>

          {/* Quick Options */}
          {!showCustom ? (
            <View style={styles.optionsContainer}>
              {quickOptions.map((opt, i) => {
                const Icon = opt.icon;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleQuickSelect(opt.date)}
                    activeOpacity={0.7}
                  >
                    <Icon size={18} color={colors.textSecondary} />
                    <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Remove reminder option if already set */}
              {hasReminder && (
                <TouchableOpacity
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  onPress={() => handleQuickSelect(null)}
                  activeOpacity={0.7}
                >
                  <X size={18} color="#ef4444" />
                  <Text style={[styles.optionText, { color: '#ef4444', fontWeight: '600' }]}>
                    Remove reminder
                  </Text>
                </TouchableOpacity>
              )}

              {/* Custom date toggle */}
              <TouchableOpacity
                style={[styles.optionRow, { borderBottomColor: 'transparent' }]}
                onPress={openCustomPicker}
                activeOpacity={0.7}
              >
                <Calendar size={18} color={colors.primary} />
                <Text style={[styles.optionText, { color: colors.primary }]}>
                  Custom date & time
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.customContainer}>
              <TouchableOpacity 
                onPress={() => setShowCustom(false)} 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: verticalScale(12) }}
              >
                <ChevronLeft size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: moderateScale(14) }}>
                  Back to quick options
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: verticalScale(12) }}>
                <Calendar size={16} color={colors.textSecondary} />
                <Text style={[styles.customLabel, { color: colors.textSecondary }]}>
                  Custom date & time
                </Text>
              </View>

              <View style={{ gap: 16, alignItems: 'center' }}>
                {Platform.OS === 'ios' ? (
                  <DateTimePicker
                    value={customDate}
                    mode="datetime"
                    display="spinner"
                    onChange={handleDateChange}
                    style={{ width: '100%', height: verticalScale(120) }}
                    textColor={colors.textPrimary}
                    themeVariant={colors.effectiveTheme === 'dark' ? 'dark' : 'light'}
                  />
                ) : (
                  <View style={{ width: '100%', gap: 12 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: verticalScale(12), paddingHorizontal: scale(16), backgroundColor: colors.backgroundSecondary, borderRadius: moderateScale(8) }}
                      onPress={() => setShowAndroidDatePicker(true)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Calendar size={16} color={colors.textPrimary} />
                        <Text style={{ color: colors.textPrimary, fontSize: moderateScale(14) }}>Date</Text>
                      </View>
                      <Text style={{ color: colors.primary, fontSize: moderateScale(14), fontWeight: '600' }}>
                        {customDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: verticalScale(12), paddingHorizontal: scale(16), backgroundColor: colors.backgroundSecondary, borderRadius: moderateScale(8) }}
                      onPress={() => setShowAndroidTimePicker(true)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Clock size={16} color={colors.textPrimary} />
                        <Text style={{ color: colors.textPrimary, fontSize: moderateScale(14) }}>Time</Text>
                      </View>
                      <Text style={{ color: colors.primary, fontSize: moderateScale(14), fontWeight: '600' }}>
                        {formatMessageTime(customDate)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Repeat Button */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingVertical: verticalScale(12), paddingHorizontal: scale(16), backgroundColor: colors.backgroundSecondary, borderRadius: moderateScale(8) }}
                  onPress={() => setShowRecurrencePicker(true)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <RepeatIcon size={16} color={colors.textPrimary} />
                    <Text style={{ color: colors.textPrimary, fontSize: moderateScale(14) }}>Repeat</Text>
                  </View>
                  <Text style={{ color: colors.primary, fontSize: moderateScale(14), fontWeight: '600' }}>{recurrence}</Text>
                </TouchableOpacity>
                
                <Button
                  title="Set Reminder"
                  variant="primary"
                  onPress={handleCustomSubmit}
                  fullWidth
                />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Recurrence Picker Modal */}
      {showRecurrencePicker && (
        <Modal transparent animationType="fade">
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowRecurrencePicker(false)}>
            <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: verticalScale(16) }]}>
              <View style={[styles.header, { borderBottomColor: colors.border, justifyContent: 'center' }]}>
                <Text style={{ fontSize: moderateScale(16), fontWeight: '600', color: colors.textPrimary }}>Repeat</Text>
              </View>
              {RECURRENCE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={{ paddingVertical: verticalScale(16), paddingHorizontal: scale(24), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                  onPress={() => {
                    setRecurrence(opt);
                    setShowRecurrencePicker(false);
                  }}
                >
                  <Text style={{ fontSize: moderateScale(16), color: recurrence === opt ? colors.primary : colors.textPrimary }}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Android Date Pickers */}
      {Platform.OS !== 'ios' && showAndroidDatePicker && (
        <DateTimePicker
          value={customDate}
          mode="date"
          display="default"
          onChange={handleAndroidDateChange}
        />
      )}
      {Platform.OS !== 'ios' && showAndroidTimePicker && (
        <DateTimePicker
          value={customDate}
          mode="time"
          display="default"
          onChange={handleAndroidTimeChange}
        />
      )}
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    maxWidth: scale(380),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    borderBottomWidth: 1,
  },
  title: {
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  closeButton: {
    padding: moderateScale(4),
  },
  optionsContainer: {
    paddingVertical: verticalScale(4),
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: moderateScale(15),
    flex: 1,
  },
  customContainer: {
    padding: moderateScale(16),
  },
  customLabel: {
    fontSize: moderateScale(13),
    fontWeight: '600',
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    fontSize: moderateScale(14),
  },
  setButton: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(8),
  },
});

export default ReminderModal;
