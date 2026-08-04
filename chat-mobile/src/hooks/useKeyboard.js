import { useContext } from 'react';
import { KeyboardContext } from '../providers/KeyboardProvider';

/**
 * useKeyboard hook
 * Provides keyboardHeight, keyboardVisible, and an animatedKeyboardHeight value.
 */
export default function useKeyboard() {
  const context = useContext(KeyboardContext);
  if (context === undefined) {
    throw new Error('useKeyboard must be used within a KeyboardProvider');
  }
  return context;
}
