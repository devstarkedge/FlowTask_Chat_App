/**
 * ScheduleModal — quick time options + custom datetime picker for scheduling messages.
 *
 * Props:
 *   visible   – boolean
 *   onClose   – () => void
 *   onSchedule – (scheduledAt: string ISO) => void
 *   colors    – theme colors
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { X, Clock, Calendar, Sun, Briefcase } from 'lucide-react-native';

function getQuickOptions() {
  const now = new Date();
  const options = [];

  // Later today at 4 PM (if before 4 PM)
  const laterToday = new Date(now);
  laterToday.setHours(16, 0, 0, 0);
  if (laterToday > now) {
    options.push({
      label: `Today at ${laterToday.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      icon: Sun,
      date: laterToday.toISOString(),
    });
  }

  // Tomorrow at 9 AM
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  options.push({
    label: `Tomorrow at 9:00 AM`,
    icon: Sun,
    date: tomorrow.toISOString(),
  });

  // Next Monday at 9 AM
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);
  options.push({
    label: `Next Monday at 9:00 AM`,
    icon: Briefcase,
    date: nextMonday.toISOString(),
  });

  return options;
}

const ScheduleModal = React.memo(function ScheduleModal({
  visible,
  onClose,
  onSchedule,
  colors,
}) {
  const quickOptions = useMemo(() => getQuickOptions(), [visible]);
  const [customDate, setCustomDate] = useState('');

  const handleCustomSubmit = () => {
    if (!customDate) return;
    const date = new Date(customDate);
    if (isNaN(date.getTime()) || date <= new Date()) {
      return;
    }
    onSchedule(date.toISOString());
    setCustomDate('');
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
              <Clock size={18} color={colors.primary} />
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Schedule Message
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Quick Options */}
          <View style={styles.optionsContainer}>
            {quickOptions.map((opt, i) => {
              const Icon = opt.icon;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    onSchedule(opt.date);
                  }}
                  activeOpacity={0.7}
                >
                  <Icon size={18} color={colors.textSecondary} />
                  <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom Date */}
          <View style={[styles.customSection, { borderTopColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
                style={[styles.scheduleButton, { backgroundColor: colors.primary }]}
                onPress={handleCustomSubmit}
                disabled={!customDate}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  Schedule
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
  customSection: {
    padding: 16,
    borderTopWidth: 1,
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
  scheduleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
});

export default ScheduleModal;
