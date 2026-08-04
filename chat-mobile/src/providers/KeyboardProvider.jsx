import React, { createContext, useState, useEffect, useRef } from 'react';
import { Keyboard, Platform, Animated, Easing, Dimensions, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const KeyboardContext = createContext({
  keyboardHeight: 0,
  keyboardVisible: false,
  animatedKeyboardHeight: null,
});

export const KeyboardProvider = ({ children }) => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  
  // Track raw OS keyboard metrics
  const [rawKeyboardHeight, setRawKeyboardHeight] = useState(0);
  
  // Track physical root layout bounds
  const [rootHeight, setRootHeight] = useState(0);
  const initialRootHeight = useRef(0);
  const initialWindowHeight = useRef(Dimensions.get('window').height);
  
  const animatedKeyboardHeight = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const onRootLayout = React.useCallback((e) => {
    const h = e.nativeEvent.layout.height;
    if (initialRootHeight.current === 0) {
      initialRootHeight.current = h;
    }
    setRootHeight(h);
  }, []);

  // Synchronize layout changes and keyboard changes
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (rawKeyboardHeight > 0) {
      // In edge-to-edge mode, the OS window doesn't shrink, so windowShrinkage is 0.
      // rawKeyboardHeight includes the system navigation bar height.
      const windowShrinkage = Math.max(0, initialRootHeight.current - rootHeight);
      
      // If the window did shrink (e.g. not in edge-to-edge), we don't need manual padding 
      // (or we need less).
      const finalPadding = Math.max(0, rawKeyboardHeight - windowShrinkage);

      if (__DEV__) {
        console.log(`[PIPELINE] KeyboardProvider (Sync): rawKeyboard=${rawKeyboardHeight}, rootHeight=${rootHeight}, Shrinkage=${windowShrinkage}, FinalPadding=${finalPadding}`);
      }
      setKeyboardHeight(finalPadding);
    } else {
      setKeyboardHeight(0);
    }
  }, [rawKeyboardHeight, rootHeight]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = (e) => {
      const h = e.endCoordinates.height;
      
      if (Platform.OS === 'ios') {
        setKeyboardHeight(h);
        setKeyboardVisible(true);
      } else {
        setRawKeyboardHeight(h);
        setKeyboardVisible(true);
      }

      if (__DEV__) {
        console.log('====== [DIAGNOSTIC] KEYBOARD OPENED ======');
        console.log(`OS: ${Platform.OS}`);
        console.log(`Reported Keyboard Height: ${h}`);
        console.log('==========================================');
      }
    };

    const onKeyboardHide = (e) => {
      if (Platform.OS === 'ios') {
        setKeyboardHeight(0);
      } else {
        setRawKeyboardHeight(0);
      }
      setKeyboardVisible(false);

      if (__DEV__) {
        console.log('====== [DIAGNOSTIC] KEYBOARD CLOSED ======');
        console.log('==========================================');
      }
    };

    const showSub = Keyboard.addListener(showEvent, onKeyboardShow);
    const hideSub = Keyboard.addListener(hideEvent, onKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    // Only animate the transition on iOS, or if requested. 
    // On Android, Yoga layout updates inherently snap nicely with the native keyboard.
    Animated.timing(animatedKeyboardHeight, {
      toValue: keyboardHeight,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [keyboardHeight, animatedKeyboardHeight]);

  return (
    <KeyboardContext.Provider value={{ keyboardHeight, keyboardVisible, animatedKeyboardHeight }}>
      <View style={{ flex: 1 }} onLayout={onRootLayout}>
        {children}
      </View>
    </KeyboardContext.Provider>
  );
};
