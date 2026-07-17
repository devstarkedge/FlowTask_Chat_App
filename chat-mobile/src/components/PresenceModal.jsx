import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";
import AccessibleModal from "./AccessibleModal";
import { useThemeStore } from "../stores/themeStore";
import { usersAPI } from "../services/api";
import { X, Circle } from "lucide-react-native";
import { rnShadowToBoxShadow } from "../utils/styleUtils";
import logger from '../utils/logger';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const PresenceModal = ({ visible, onClose }) => {
  const { colors } = useThemeStore();

  const presenceOptions = [
    {
      label: "Active",
      value: "online",
      color: colors.online,
      description: "Let people know you're available",
    },
    {
      label: "Away",
      value: "away",
      color: colors.away,
      description: "You're away from your device",
    },
    {
      label: "Do not disturb",
      value: "dnd",
      color: colors.busy,
      description: "Do not disturb mode",
    },
  ];

  const handleSelect = async (presence) => {
    try {
      await usersAPI.setPresence(presence.value);
    } catch (err) {
      logger.error('Failed to set presence:', err);
    }
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
    onClose();
  };

  const handleClose = () => {
    if (Platform.OS === "web") {
      document.activeElement?.blur();
    }
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
              Set yourself as
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Presence Options */}
          <View style={styles.content}>
            {presenceOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.presenceItem,
                  index < presenceOptions.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
                onPress={() => handleSelect(option)}
                activeOpacity={0.7}
              >
                <Circle size={12} color={option.color} fill={option.color} />
                <View style={styles.presenceContent}>
                  <Text
                    style={[
                      styles.presenceLabel,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.presenceDescription,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {option.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
    presenceItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: scale(20),
      paddingVertical: verticalScale(16),
      gap: 14,
    },
    presenceContent: {
      flex: 1,
    },
    presenceLabel: {
      fontSize: moderateScale(16),
      fontWeight: "600",
      marginBottom: verticalScale(2),
    },
    presenceDescription: {
      fontSize: moderateScale(13),
    },
  });

export default PresenceModal;
