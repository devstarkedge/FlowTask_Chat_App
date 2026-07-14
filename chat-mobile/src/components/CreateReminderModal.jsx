import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { X, Check } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatMessageTime } from '../utils/dateUtils';

const RECURRENCE_OPTIONS = ['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'];

const CreateReminderModal = ({ visible, onClose, onSubmit, colors }) => {
  const [date, setDate] = useState(new Date());
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState('None');
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  };

  const handleTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) setDate(selectedTime);
  };

  const formattedDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedTime = formatMessageTime(date);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconButton} onPress={onClose}>
              <X size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Reminder</Text>
            <TouchableOpacity style={styles.iconButton} onPress={() => {
              onSubmit && onSubmit({ date, description, recurrence });
              onClose();
            }}>
              <Check size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* When */}
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>When</Text>
              <TouchableOpacity style={[styles.pill, { backgroundColor: colors.backgroundSecondary }]} onPress={() => setShowDatePicker(true)}>
                <Text style={[styles.pillText, { color: colors.textPrimary }]}>{formattedDate}</Text>
              </TouchableOpacity>
            </View>

            {/* Time */}
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Time</Text>
              <TouchableOpacity style={[styles.pill, { backgroundColor: colors.backgroundSecondary }]} onPress={() => setShowTimePicker(true)}>
                <Text style={[styles.pillText, { color: colors.textPrimary }]}>{formattedTime}</Text>
              </TouchableOpacity>
            </View>

            {/* Repeat */}
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Repeat</Text>
              <TouchableOpacity style={[styles.pill, { backgroundColor: colors.backgroundSecondary }]} onPress={() => setShowRecurrencePicker(true)}>
                <Text style={[styles.pillText, { color: colors.textPrimary }]}>{recurrence}</Text>
              </TouchableOpacity>
            </View>

            {/* Description */}
            <View style={styles.descContainer}>
              <Text style={[styles.descLabel, { color: colors.textPrimary }]}>Description</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Set a reminder"
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                autoFocus={false}
              />
            </View>
          </View>
        </View>

        {/* iOS Date/Time Picker Modal */}
        {Platform.OS === 'ios' && (showDatePicker || showTimePicker) && (
          <Modal transparent animationType="slide" visible={true}>
            <View style={styles.iosPickerOverlay}>
              <View style={[styles.iosPickerContainer, { backgroundColor: colors.background }]}>
                <View style={[styles.iosPickerHeader, { borderBottomColor: colors.border }]}>
                  <TouchableOpacity onPress={() => { setShowDatePicker(false); setShowTimePicker(false); }}>
                    <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={date}
                  mode={showDatePicker ? 'date' : 'time'}
                  display="spinner"
                  textColor={colors.textPrimary}
                  themeVariant={colors.background === '#ffffff' ? 'light' : 'dark'}
                  onChange={(event, selectedDate) => {
                    if (selectedDate) setDate(selectedDate);
                  }}
                  style={{ width: '100%', height: 200 }}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Android Date/Time Picker */}
        {Platform.OS !== 'ios' && showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )}
        {Platform.OS !== 'ios' && showTimePicker && (
          <DateTimePicker
            value={date}
            mode="time"
            display="default"
            onChange={handleTimeChange}
          />
        )}

        {/* Recurrence Picker Modal */}
        {showRecurrencePicker && (
          <Modal transparent animationType="fade">
            <TouchableOpacity style={styles.iosPickerOverlay} activeOpacity={1} onPress={() => setShowRecurrencePicker(false)}>
              <View style={[styles.iosPickerContainer, { backgroundColor: colors.card, paddingBottom: 20 }]}>
                <View style={[styles.iosPickerHeader, { borderBottomColor: colors.border, justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>Repeat</Text>
                </View>
                {RECURRENCE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={{ paddingVertical: 16, paddingHorizontal: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
                    onPress={() => {
                      setRecurrence(opt);
                      setShowRecurrencePicker(false);
                    }}
                  >
                    <Text style={{ fontSize: 16, color: recurrence === opt ? colors.primary : colors.textPrimary }}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  container: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    height: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  form: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 16,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 15,
    fontWeight: '500',
  },
  descContainer: {
    paddingVertical: 24,
  },
  descLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  iosPickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  iosPickerContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 40, // safe area
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  }
});

export default CreateReminderModal;
