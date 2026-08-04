import { useEffect, useRef } from 'react';
import { Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useKeyboard from './useKeyboard';

export default function useLayoutDiagnostics(screenName) {
  const insets = useSafeAreaInsets();
  const { keyboardVisible, keyboardHeight } = useKeyboard();
  const measurements = useRef({
    composer: { y: 0, height: 0 },
    list: { height: 0 },
    container: { height: 0 }
  }).current;

  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'android') return;

    if (keyboardVisible) {
      console.log(`\n====== [LAYOUT AUDIT: ${screenName}] KEYBOARD OPENED ======`);
    } else {
      console.log(`\n====== [LAYOUT AUDIT: ${screenName}] KEYBOARD CLOSED ======`);
    }

    // Determine navigation mode based on insets.bottom
    const navMode = insets.bottom > 30 ? '3-Button Navigation (High Inset)' : 
                   (insets.bottom > 0 ? 'Gesture Navigation (Low Inset)' : 'No Inset / Hidden Nav');

    console.log(`Navigation Mode: ${navMode}`);
    console.log(`SafeAreaInsets.bottom: ${insets.bottom}`);
    console.log(`Window Height: ${Dimensions.get('window').height}`);
    console.log(`Screen Height: ${Dimensions.get('screen').height}`);
    console.log(`Keyboard Height: ${keyboardHeight}`);
    console.log(`Composer Y Position: ${measurements.composer.y}`);
    console.log(`Composer Height: ${measurements.composer.height}`);
    console.log(`FlatList Height: ${measurements.list.height}`);
    console.log(`Root Container Height: ${measurements.container.height}`);
    console.log('==========================================================\n');
  }, [keyboardVisible, insets.bottom, keyboardHeight, screenName, measurements]);

  return {
    onContainerLayout: (e) => {
      measurements.container.height = e.nativeEvent.layout.height;
    },
    onListLayout: (e) => {
      measurements.list.height = e.nativeEvent.layout.height;
    },
    onComposerLayout: (e) => {
      measurements.composer.y = e.nativeEvent.layout.y;
      measurements.composer.height = e.nativeEvent.layout.height;
    }
  };
}
