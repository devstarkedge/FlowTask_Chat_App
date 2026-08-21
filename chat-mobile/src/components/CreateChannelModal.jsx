import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Switch,
  ActivityIndicator,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { X, Hash, Lock, Search, Check, Plus } from "lucide-react-native";
import { directoriesAPI } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { AppAvatar } from "./common";
import { verticalScale, moderateScale } from '../utils/responsive';
import useResponsive from '../hooks/useResponsive';
import Toast from 'react-native-toast-message';
import AddMembersDrawer from './AddMembersDrawer';
import Button from './common/Button';
import IconButton from './common/IconButton';

/**
 * CreateChannelModal — Slack-like modal for creating a new channel.
 */
const CreateChannelModal = ({ visible, onClose, onCreated, navigation }) => {
  const { isTablet, isDesktop, width } = useResponsive();
  const isWide = isTablet || isDesktop || width > 640;
  const formPadding = moderateScale(20);
  const gap = 12;
  const containerWidth = isWide ? (Math.min(width, 600) - 2 * formPadding) : (width - 2 * formPadding);
  const chipWidth = (containerWidth - 2 * gap) / 2.5;
  const { colors } = useThemeStore();
  const createChannel = useChannelStore((s) => s.createChannel);
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddMembers, setShowAddMembers] = useState(false);


  const handleSubmit = async (membersToUse = []) => {
    const trimmedName = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmedName) {
      setError("Channel name is required");
      return;
    }

    if (isPrivate && !showAddMembers && membersToUse.length === 0) {
      setShowAddMembers(true);
      return;
    }

    setLoading(true);
    try {
      const channel = await createChannel({
        name: trimmedName,
        visibility: isPrivate ? "private" : "public",
        topic: topic.trim(),
        memberIds: membersToUse.map(m => m._id),
      });
      // Reset form
      setName("");
      setTopic("");
      setIsPrivate(false);
      setShowAddMembers(false);
      onClose();

      Toast.show({
        type: 'success',
        text1: 'Channel created',
      });

      // Navigate to the new channel
      if (channel && navigation) {
        navigation.navigate("Chat", {
          channelId: channel._id,
          channelName: channel.name,
        });
      }
      onCreated?.(channel);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to create channel");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName("");
    setTopic("");
    setIsPrivate(false);
    setError(null);
    setShowAddMembers(false);
    onClose();
  };

  return (
    <>
    <Modal visible={visible && !showAddMembers} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={[
          styles.overlay,
          { backgroundColor: colors.overlay },
          isWide && styles.wideOverlay,
        ]}
      >
        <View style={[
          styles.container,
          { backgroundColor: colors.background },
          isWide && styles.wideContainer,
        ]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <IconButton 
              icon={X} 
              onPress={handleClose} 
              size={40} 
              iconSize={22} 
              variant="ghost" 
              style={{ marginLeft: -8 }} 
            />
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Create a channel
            </Text>
            <Button
              title={isPrivate ? "Next" : "Create"}
              variant="primary"
              onPress={() => handleSubmit([])}
              disabled={!name.trim() || loading}
              loading={loading}
              style={{ minHeight: moderateScale(36), paddingVertical: moderateScale(6) }}
            />
          </View>

          {/* Form */}
          <ScrollView 
            style={styles.form} 
            contentContainerStyle={{ paddingBottom: verticalScale(40) }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Channel name */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Channel name
            </Text>
            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
              <Hash size={18} color={colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: colors.inputText }]}
                placeholder="e.g. project-updates"
                placeholderTextColor={colors.inputPlaceholder}
                value={name}
                onChangeText={(text) => {
                  let newText = text.toLowerCase().replace(/\s/g, "-");
                  newText = newText.replace(/[^a-z0-9-_]/g, "");
                  setName(newText);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={80}
              />
            </View>
            {error && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
            )}
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Channels are where your team communicates. They're best when
              organized around a topic — #marketing, for example.
            </Text>

            {/* Topic */}
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: verticalScale(20) }]}>
              Description (optional)
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  color: colors.inputText,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBackground,
                },
              ]}
              placeholder="What's this channel about?"
              placeholderTextColor={colors.inputPlaceholder}
              value={topic}
              onChangeText={setTopic}
              multiline
              numberOfLines={3}
              maxLength={250}
            />

            {/* Private toggle */}
            <View style={[styles.toggleRow, { borderTopColor: colors.border }]}>
              <View style={styles.toggleInfo}>
                <Lock size={18} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>
                    Make private
                  </Text>
                  <Text style={[styles.toggleHint, { color: colors.textTertiary }]}>
                    Only invited members can see private channels
                  </Text>
                </View>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={setIsPrivate}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Add Members section was extracted to AddMembersDrawer */}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
      <AddMembersDrawer 
        visible={showAddMembers} 
        onClose={() => setShowAddMembers(false)}
        onConfirm={(members) => {
          handleSubmit(members);
        }}
        isLoading={loading}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  wideOverlay: {
    justifyContent: "center",
    alignItems: "center",
    padding: moderateScale(24),
  },
  container: {
    maxHeight: "90%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    flexShrink: 1,
  },
  wideContainer: {
    width: "100%",
    maxWidth: 600,
    borderRadius: 16,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(14),
    borderBottomWidth: 1,
  },
  closeBtn: { padding: moderateScale(4) },
  title: { fontSize: moderateScale(16), fontWeight: "700" },
  createBtn: {
    paddingHorizontal: moderateScale(16),
    height: moderateScale(36),
    borderRadius: moderateScale(8),
    minWidth: moderateScale(64),
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontWeight: "700",
    fontSize: moderateScale(14),
  },
  form: {
    padding: moderateScale(20),
    flexShrink: 1,
  },
  label: {
    fontSize: moderateScale(13),
    fontWeight: "700",
    marginBottom: moderateScale(8),
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: moderateScale(12),
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: moderateScale(15),
    paddingVertical: moderateScale(10),
  },
  hint: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(8),
    lineHeight: 18,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: moderateScale(8),
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(10),
    fontSize: moderateScale(14),
    minHeight: moderateScale(70),
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: moderateScale(13),
    marginTop: moderateScale(6),
    fontWeight: "500",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: moderateScale(24),
    paddingTop: moderateScale(20),
    borderTopWidth: 0.5,
    gap: 12,
  },
  toggleInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  toggleLabel: {
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  toggleHint: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(2),
  },
  // Search Result Check etc removed or moved to AddMembersDrawer
});

export default CreateChannelModal;
