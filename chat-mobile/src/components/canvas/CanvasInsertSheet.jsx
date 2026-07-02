import React from 'react';
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
import { Table, Image, Minus, Info, Columns, X } from 'lucide-react-native';

export default function CanvasInsertSheet({ visible, onClose, onInsertOption }) {
  const slideAnim = React.useRef(new Animated.Value(0)).current;

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

  const handlePress = (optionType) => {
    onClose();
    setTimeout(() => {
      onInsertOption(optionType);
    }, 150);
  };

  return (
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
              transform: [{ translateY }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Insert Block</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.optionsContainer}>
              <TouchableOpacity
                style={styles.option}
                onPress={() => handlePress('table')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: '#e0e7ff' }]}>
                  <Table size={22} color="#4f46e5" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.optionTitle}>Table</Text>
                  <Text style={styles.optionSubtitle}>Insert a 3x3 table grid</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                onPress={() => handlePress('image')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: '#ecfdf5' }]}>
                  <Image size={22} color="#10b981" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.optionTitle}>Image</Text>
                  <Text style={styles.optionSubtitle}>Insert image from gallery</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                onPress={() => handlePress('callout')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: '#fff7ed' }]}>
                  <Info size={22} color="#f97316" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.optionTitle}>Callout Block</Text>
                  <Text style={styles.optionSubtitle}>Highlight important info</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.option}
                onPress={() => handlePress('hr')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconContainer, { backgroundColor: '#f3f4f6' }]}>
                  <Minus size={22} color="#6b7280" />
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.optionTitle}>Divider</Text>
                  <Text style={styles.optionSubtitle}>Horizontal dividing line</Text>
                </View>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  safeArea: {
    paddingBottom: Platform.OS === 'android' ? 16 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  closeBtn: {
    padding: 4,
  },
  optionsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
});
