import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useThemeStore } from "../../stores/themeStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { X, Upload, Briefcase } from "lucide-react-native";
import { workspaceAPI } from "../../services/api";
import Toast from "react-native-toast-message";
import logger from "../../utils/logger";

const CreateWorkspaceModal = ({ visible, onClose, onSuccess, navigation }) => {
  const { colors } = useThemeStore();
  const { fetchWorkspaces, switchWorkspace } = useWorkspaceStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const requestPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant photo library permissions to upload workspace logo.',
          [{ text: 'OK' }]
        );
        return false;
      }
    }
    return true;
  };

  const handlePickImage = async () => {
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        setAvatar(result.assets[0]);
      }
    } catch (err) {
      logger.error("Image picker error:", err);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Workspace name is required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: trimmedName,
      };
      if (description.trim()) {
        payload.description = description.trim();
      }

      const { data } = await workspaceAPI.create(payload);
      const workspace = data.data?.workspace || data.data;

      Toast.show({
        type: "success",
        text1: `${trimmedName} created`,
        text2: "Workspace ready to use",
      });

      setName("");
      setDescription("");
      setAvatar(null);
      onClose();
      if (onSuccess) onSuccess();

      await fetchWorkspaces();
      if (workspace?._id) {
        await switchWorkspace(workspace._id);
      }

      if (navigation?.navigate) {
        setTimeout(() => {
          navigation.navigate("Main");
        }, 200);
      }
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || "Failed to create workspace";
      setError(msg);
      Toast.show({ type: "error", text1: msg });
      logger.error("Create workspace error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setAvatar(null);
    setError(null);
    onClose();
  };

  return (
    <Modal 
      visible={visible} 
      animationType="slide" 
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Create Workspace
            </Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading || !name.trim()}
              style={[
                styles.createBtn,
                { backgroundColor: colors.primary },
                (!name.trim() || loading) && { opacity: 0.4 },
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary || '#fff'} />
              ) : (
                <Text style={[styles.createBtnText, { color: colors.textOnPrimary || '#fff' }]}>
                  Create
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.form} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.avatarSection}>
              <TouchableOpacity
                style={[
                  styles.avatarUpload,
                  { backgroundColor: colors.backgroundTertiary || colors.card, borderColor: colors.border },
                ]}
                onPress={handlePickImage}
                activeOpacity={0.7}
              >
                {avatar?.uri ? (
                  <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Briefcase size={32} color={colors.textTertiary} strokeWidth={1.5} />
                    <View style={[styles.uploadIconBadge, { backgroundColor: colors.primary }]}>
                      <Upload size={14} color={colors.textOnPrimary || '#fff'} />
                    </View>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[styles.avatarHint, { color: colors.textTertiary }]}>
                Tap to upload workspace logo
              </Text>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Workspace name *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.inputText || colors.textPrimary,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBackground || colors.card,
                },
              ]}
              placeholder="e.g. Acme Inc"
              placeholderTextColor={colors.inputPlaceholder || colors.textTertiary}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(null);
              }}
              autoCorrect={false}
              maxLength={100}
              returnKeyType="next"
            />
            {error && (
              <Text style={[styles.errorText, { color: colors.error || '#ef4444' }]}>{error}</Text>
            )}

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>
              Description (optional)
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  color: colors.inputText || colors.textPrimary,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBackground || colors.card,
                },
              ]}
              placeholder="What's this workspace about?"
              placeholderTextColor={colors.inputPlaceholder || colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />

            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Create a workspace to organize your team's channels, files, and conversations.
            </Text>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  title: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
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
    flex: 1,
    padding: 20,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarUpload: {
    width: 100,
    height: 100,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    overflow: "hidden",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  uploadIconBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarHint: {
    fontSize: 12,
    textAlign: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 90,
    maxHeight: 150,
  },
  errorText: {
    fontSize: 13,
    marginTop: 6,
    fontWeight: "500",
  },
  hint: {
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
});

export default CreateWorkspaceModal;
