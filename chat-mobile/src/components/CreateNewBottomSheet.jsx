import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores/themeStore';
import { Hash, MessageSquare, Briefcase } from 'lucide-react-native';
import CreateChannelModal from './CreateChannelModal';
import CreateWorkspaceModal from './workspace/CreateWorkspaceModal';
import { scale, verticalScale, moderateScale } from '../utils/responsive';


const CreateNewBottomSheet = ({ visible, onClose, navigation }) => {
  const { colors } = useThemeStore();
  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false);
  const [dmModalVisible, setDMModalVisible] = useState(false);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [500, 0],
  });

  const handleOptionPress = (option) => {
    onClose();
    setTimeout(() => {
      if (option === 'message') {
        if (navigation?.navigate) {
          navigation.navigate('NewMessage');
        }
      } else if (option === 'channel') {
        setChannelModalVisible(true);
      } else if (option === 'dm') {
        setDMModalVisible(true);
      } else if (option === 'workspace') {
        setWorkspaceModalVisible(true);
      }
    }, 300);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: colors.card || colors.background,
                transform: [{ translateY }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <SafeAreaView edges={['bottom']} style={styles.safeArea}>
              <View style={styles.handleContainer}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </View>

              <View style={styles.optionsContainer}>
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => handleOptionPress('message')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
                    <MessageSquare size={22} color={colors.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                      New Message
                    </Text>
                    <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                      Send a direct message
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.option}
                  onPress={() => handleOptionPress('channel')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
                    <Hash size={22} color={colors.textPrimary} strokeWidth={2} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                      Create Channel
                    </Text>
                    <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                      Organize teams and work
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* <TouchableOpacity
                  style={styles.option}
                  onPress={() => handleOptionPress('workspace')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
                    <Briefcase size={22} color={colors.textPrimary} strokeWidth={2} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                      Create Workspace
                    </Text>
                    <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                      New team workspace
                    </Text>
                  </View>
                </TouchableOpacity> */}
              </View>
            </SafeAreaView>
          </Animated.View>
        </Pressable>
      </Modal>

      <CreateChannelModal
        visible={channelModalVisible}
        onClose={() => setChannelModalVisible(false)}
        navigation={navigation}
      />

      <CreateWorkspaceModal
        visible={workspaceModalVisible}
        onClose={() => setWorkspaceModalVisible(false)}
        navigation={navigation}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  safeArea: {
    paddingBottom: Platform.OS === 'android' ? 16 : 0,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: verticalScale(12),
    paddingBottom: verticalScale(8),
  },
  handle: {
    width: scale(40),
    height: verticalScale(4),
    borderRadius: moderateScale(2),
  },
  optionsContainer: {
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(12),
    paddingBottom: verticalScale(20),
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(12),
    borderRadius: moderateScale(8),
    marginBottom: verticalScale(8),
  },
  iconContainer: {
    width: scale(48),
    height: verticalScale(48),
    borderRadius: moderateScale(12),
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: scale(16),
  },
  optionTitle: {
    fontSize: moderateScale(16),
    fontWeight: '600',
    marginBottom: verticalScale(2),
  },
  optionSubtitle: {
    fontSize: moderateScale(13),
  },
});

export default CreateNewBottomSheet;
