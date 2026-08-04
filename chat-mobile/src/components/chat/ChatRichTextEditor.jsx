/**
 * ChatRichTextEditor — TipTap WYSIWYG editor for the mobile message composer.
 *
 * Same architecture as web RichTextEditor / Canvas EditorHtml:
 * TipTap in a WebView, RN posts toggleBold/etc., WebView emits { html, text }.
 * Users see bold/italic/underline visually — never raw Markdown.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildChatEditorHtml } from './buildChatEditorHtml';
import { moderateScale, verticalScale } from '../../utils/responsive';
import logger from '../../utils/logger';

const ChatRichTextEditor = forwardRef(function ChatRichTextEditor(
  {
    placeholder = 'Message...',
    colors,
    initialHtml = '',
    onUpdate,
    onSelectionChange,
    onMentionQuery,
    onMentionClose,
    onFocus,
    onBlur,
    minHeight = verticalScale(40),
    maxHeight = verticalScale(140),
    style,
  },
  ref,
) {
  const webRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(minHeight);
  const pendingContentRef = useRef(null);
  const lastHtmlRef = useRef('');
  const lastTextRef = useRef('');

  const isDark =
    colors?.background === '#000000' ||
    colors?.background === '#1A1D21' ||
    colors?.isDark === true;

  const htmlSource = useMemo(
    () => ({
      html: buildChatEditorHtml({
        placeholder,
        dark: isDark,
        textColor: colors?.inputText || colors?.textPrimary,
        placeholderColor: colors?.inputPlaceholder || colors?.textTertiary,
      }),
    }),
    [placeholder, isDark, colors?.inputText, colors?.textPrimary, colors?.inputPlaceholder, colors?.textTertiary],
  );

  // Remounting the document requires a fresh ready handshake
  useEffect(() => {
    setReady(false);
    pendingContentRef.current = lastHtmlRef.current || initialHtml || null;
  }, [htmlSource]);

  const sendCommand = useCallback((command, value = null) => {
    if (!webRef.current) return;
    webRef.current.postMessage(JSON.stringify({ command, value }));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => sendCommand('focus'),
      blur: () => sendCommand('blur'),
      clear: () => {
        lastHtmlRef.current = '';
        lastTextRef.current = '';
        sendCommand('clear');
      },
      setContent: (html) => {
        const next = html || '';
        lastHtmlRef.current = next;
        if (ready) sendCommand('setContent', next);
        else pendingContentRef.current = next;
      },
      getContent: () => ({
        html: lastHtmlRef.current,
        text: lastTextRef.current,
      }),
      isReady: () => ready,
      toggleBold: () => sendCommand('toggleBold'),
      toggleItalic: () => sendCommand('toggleItalic'),
      toggleUnderline: () => sendCommand('toggleUnderline'),
      toggleStrike: () => sendCommand('toggleStrike'),
      toggleBulletList: () => sendCommand('toggleBulletList'),
      toggleOrderedList: () => sendCommand('toggleOrderedList'),
      toggleBlockquote: () => sendCommand('toggleBlockquote'),
      toggleCode: () => sendCommand('toggleCode'),
      toggleCodeBlock: () => sendCommand('toggleCodeBlock'),
      setLink: (href) => sendCommand('setLink', href),
      insertContent: (content) => sendCommand('insertContent', content),
      insertText: (text) => sendCommand('insertText', text),
      insertMention: (attrs) => sendCommand('insertMention', attrs),
      insertEmoji: (emoji) => sendCommand('insertText', emoji),
    }),
    [ready, sendCommand],
  );

  useEffect(() => {
    if (!ready) return;
    sendCommand('setTheme', isDark ? 'dark' : 'light');
  }, [ready, isDark, sendCommand]);

  useEffect(() => {
    if (!ready) return;
    if (pendingContentRef.current != null) {
      sendCommand('setContent', pendingContentRef.current);
      pendingContentRef.current = null;
    } else if (initialHtml) {
      sendCommand('setContent', initialHtml);
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMessage = useCallback(
    (event) => {
      let data;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      switch (data.type) {
        case 'ready':
          setReady(true);
          break;
        case 'update': {
          lastHtmlRef.current = data.html || '';
          lastTextRef.current = data.text || '';
          const isEmpty = !(data.text || '').trim();
          onUpdate?.({
            html: lastHtmlRef.current,
            text: lastTextRef.current,
            isEmpty,
          });
          break;
        }
        case 'selection':
          onSelectionChange?.(data);
          break;
        case 'height': {
          const h = Math.round(data.height || minHeight);
          const clamped = Math.min(maxHeight, Math.max(minHeight, h));
          setHeight((prev) => (Math.abs(prev - clamped) < 2 ? prev : clamped));
          break;
        }
        case 'mentionQuery':
          onMentionQuery?.(data.query || '');
          break;
        case 'mentionClose':
          onMentionClose?.();
          break;
        case 'focus':
          onFocus?.();
          break;
        case 'blur':
          onBlur?.();
          break;
        case 'error':
          logger.error('[ChatRichTextEditor]', data.message || data);
          break;
        default:
          break;
      }
    },
    [
      minHeight,
      maxHeight,
      onUpdate,
      onSelectionChange,
      onMentionQuery,
      onMentionClose,
      onFocus,
      onBlur,
    ],
  );

  return (
    <View style={[styles.wrap, { height }, style]}>
      <WebView
        ref={webRef}
        source={htmlSource}
        onMessage={handleMessage}
        style={[styles.webview, { backgroundColor: 'transparent' }]}
        containerStyle={{ backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        scrollEnabled={height >= maxHeight - 2}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        opaque={false}
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        // Allow tapping into contenteditable on Android
        nestedScrollEnabled
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    minHeight: moderateScale(40),
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
    width: '100%',
  },
});

export default ChatRichTextEditor;
