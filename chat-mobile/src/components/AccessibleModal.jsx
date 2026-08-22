import React, { useEffect, useRef } from 'react';
import { Modal, Platform } from 'react-native';

/**
 * AccessibleModal - A wrapper around React Native Modal that properly manages
 * focus for web accessibility.
 * 
 * This component fixes the "Blocked aria-hidden on an element because its 
 * descendant retained focus" warning on React Native Web.
 */
import { SafeAreaProvider } from 'react-native-safe-area-context';

const AccessibleModal = ({ visible, onRequestClose, children, ...props }) => {
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    if (visible) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement;
      
      // Blur any focused element before modal opens
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    } else {
      // When modal closes, restore focus if needed
      if (previousActiveElement.current && previousActiveElement.current !== document.body) {
        // Use setTimeout to ensure modal is fully unmounted
        setTimeout(() => {
          try {
            previousActiveElement.current?.focus?.();
          } catch (e) {
            // Element might be unmounted, ignore
          }
          previousActiveElement.current = null;
        }, 0);
      }
    }
  }, [visible]);

  const handleRequestClose = () => {
    if (Platform.OS === 'web' && document.activeElement) {
      document.activeElement.blur();
    }
    onRequestClose?.();
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={handleRequestClose}
      {...props}
    >
      <SafeAreaProvider>
        {children}
      </SafeAreaProvider>
    </Modal>
  );
};

export default AccessibleModal;
