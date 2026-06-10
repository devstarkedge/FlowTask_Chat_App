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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useThemeStore } from "../stores/themeStore";
import { useChannelStore } from "../stores/channelStore";
import { X, Hash, Lock } from "lucide-react-native";

/**
 * CreateChannelModal — Slack-like modal for creating a new channel.
 */
const CreateChannelModal = ({ visible, onClose, onCreated, navigation }) => {
  const { colors } = useThemeStore();
  const createChannel = useChannelStore((s) => s.createChannel);

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    const trimmedName = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmedName) {
      setError("Channel name is required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const channel = await createChannel({
        name: trimmedName,
        visibility: isPrivate ? "private" : "public",
        topic: topic.trim(),
      });
      // Reset form
      setName("");
      setTopic("");
      setIsPrivate(false);
      onClose();
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
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <X size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Create a channel
            </Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading || !name.trim()}
              style={[
                styles.createBtn,
                { backgroundColor: colors.primary },
                (!name.trim() || loading) && { opacity: 0.4 },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Text style={[styles.createBtnText, { color: colors.textOnPrimary }]}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
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
                  setName(text.toLowerCase().replace(/[^a-z0-9-_]/g, ""));
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
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    maxHeight: "90%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: "700" },
  createBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 64,
    alignItems: "center",
  },
  createBtnText: {
    fontWeight: "700",
    fontSize: 14,
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: 13,
    marginTop: 6,
    fontWeight: "500",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    paddingTop: 20,
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
    fontSize: 14,
    fontWeight: "600",
  },
  toggleHint: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default CreateChannelModal;
