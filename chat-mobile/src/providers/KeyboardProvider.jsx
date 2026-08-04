import React, { createContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Keyboard, Platform, Animated, Easing, View, Dimensions } from 'react-native';

export const KeyboardContext = createContext({
  keyboardHeight: 0,
  keyboardVisible: false,
  bottomOffset: 0,
  animatedKeyboardHeight: null,
});

/**
 * Single source of truth for Android keyboard clearance:
 * measure how many pixels of OUR root view actually overlap the IME.
 *
 * rootBottom (in screen coords) − keyboard.screenY
 *
 * - adjustResize already lifted the window → overlap ≈ 0 → no extra pad
 * - adjustNothing / no resize → overlap ≈ keyboard height → pad that amount
 * - any OEM / nav mode → exact geometric overlap, no double-counting
 */
export const KeyboardProvider = ({ children }) => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const animatedKeyboardHeight = useRef(new Animated.Value(0)).current;
  const lastOffsetRef = useRef(0);
  const rootRef = useRef(null);
  const coordsRef = useRef(null);
  const measureGenRef = useRef(0);

  const publishFromMeasure = useCallback((coords) => {
    const reported = Math.round(coords?.height || 0);
    const node = rootRef.current;

    const apply = (overlap) => {
      const next = Math.max(0, Math.round(overlap));
      lastOffsetRef.current = next;
      setKeyboardHeight(reported);
      setBottomOffset(next);
      setKeyboardVisible(true);
    };

    if (!node || typeof node.measureInWindow !== 'function') {
      apply(reported);
      return;
    }

    const gen = ++measureGenRef.current;
    node.measureInWindow((x, y, _w, h) => {
      // Ignore stale async measures from a previous keyboard event
      if (gen !== measureGenRef.current) return;

      const keyboardTop =
        typeof coords?.screenY === 'number'
          ? coords.screenY
          : Dimensions.get('screen').height - reported;

      // How far our root extends below the top of the keyboard
      const overlap = y + h - keyboardTop;
      apply(overlap);
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = (e) => {
      const coords = e?.endCoordinates;
      coordsRef.current = coords;
      const reported = Math.round(coords?.height || 0);

      if (Platform.OS === 'ios') {
        lastOffsetRef.current = reported;
        setKeyboardHeight(reported);
        setBottomOffset(reported);
        setKeyboardVisible(true);
        return;
      }

      // One frame later so any OEM resize layout is committed, then measure once.
      requestAnimationFrame(() => {
        publishFromMeasure(coords);
      });
    };

    const onKeyboardHide = () => {
      measureGenRef.current += 1; // invalidate in-flight measures
      coordsRef.current = null;
      lastOffsetRef.current = 0;
      setKeyboardHeight(0);
      setBottomOffset(0);
      setKeyboardVisible(false);
    };

    const showSub = Keyboard.addListener(showEvent, onKeyboardShow);
    const hideSub = Keyboard.addListener(hideEvent, onKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [publishFromMeasure]);

  useEffect(() => {
    const target = Platform.OS === 'ios' ? keyboardHeight : bottomOffset;
    if (Platform.OS !== 'ios') {
      animatedKeyboardHeight.setValue(target);
      return;
    }
    Animated.timing(animatedKeyboardHeight, {
      toValue: target,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [keyboardHeight, bottomOffset, animatedKeyboardHeight]);

  const value = useMemo(
    () => ({ keyboardHeight, keyboardVisible, bottomOffset, animatedKeyboardHeight }),
    [keyboardHeight, keyboardVisible, bottomOffset, animatedKeyboardHeight]
  );

  return (
    <KeyboardContext.Provider value={value}>
      <View ref={rootRef} style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </KeyboardContext.Provider>
  );
};
