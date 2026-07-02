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
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { X, Clock, Bell, Calendar } from 'lucide-react-native';

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
  const [customDate, setCustomDate] = useState('');

  const handleCustomSubmit = () => {
    if (!customDate) return;
    const date = new Date(customDate);
    if (isNaN(date.getTime()) || date <= new Date()) return;
    onSetReminder(date.toISOString());
    setCustomDate('');
    setShowCustom(false);
    onClose();
  };

  const handleQuickSelect = (date) => {
    onSetReminder(date);
    onClose();
  };

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
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
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
                onPress={() => setShowCustom(true)}
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
              <TouchableOpacity onPress={() => setShowCustom(false)} style={{ marginBottom: 12 }}>
                <Text style={{ color: colors.primary, fontSize: 14 }}>
                  ← Back to quick options
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Calendar size={16} color={colors.textSecondary} />
                <Text style={[styles.customLabel, { color: colors.textSecondary }]}>
                  Custom date & time
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  style={[styles.dateInput, {
                    color: colors.inputText,
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.border,
                  }]}
                  placeholder="YYYY-MM-DDThh:mm"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={customDate}
                  onChangeText={setCustomDate}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.setButton, { backgroundColor: colors.primary }]}
                  onPress={handleCustomSubmit}
                  disabled={!customDate}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Set</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
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
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  optionsContainer: {
    paddingVertical: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 15,
    flex: 1,
  },
  customContainer: {
    padding: 16,
  },
  customLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  setButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});

export default ReminderModal;
