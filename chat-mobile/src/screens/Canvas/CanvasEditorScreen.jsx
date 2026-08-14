import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  TouchableOpacity,
  Text,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenLayout from '../../components/common/ScreenLayout';
import {
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { useCanvasStore } from '../../stores/canvasStore';
import { useThemeStore } from '../../stores/themeStore';
import { fileAPI, directoriesAPI } from '../../services/api';
import CanvasHeader from '../../components/canvas/CanvasHeader';
import CanvasFormatToolbar from '../../components/canvas/CanvasFormatToolbar';
import CanvasInsertSheet from '../../components/canvas/CanvasInsertSheet';
import CanvasCommentsSheet from '../../screens/Canvas/CanvasCommentsSheet';
import CanvasShareModal from '../../screens/Canvas/CanvasShareModal';
import { EDITOR_HTML } from './EditorHtml';
import ENV from '../../config/environment';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import logger from '../../utils/logger';

export default function CanvasEditorScreen({ route, navigation }) {
  const { canvasId, channelId } = route.params || {};
  const webviewRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);
  const [selectionState, setSelectionState] = useState({});
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useThemeStore();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboardHeight = useKeyboardState((state) => state.height);
  const toolbarHeight = verticalScale(48);

  // Mentions
  const [allUsers, setAllUsers] = useState([]);
  const [mentionSearch, setMentionSearch] = useState(null);
  const [filteredUsers, setFilteredUsers] = useState([]);

  // Sheets visibility
  const [insertVisible, setInsertVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  const {
    activeCanvas,
    comments,
    presence,
    isLoading,
    loadCanvas,
    updateCanvas,
    clearActiveCanvas,
    createComment,
    replyToComment,
    resolveComment,
    fetchHistory,
  } = useCanvasStore();

  /**
   * Keep WebView frame stable relative to the closed-keyboard toolbar slot.
   * When keyboard is visible, resize the WebView container so its viewport
   * matches the visible area above the keyboard + format toolbar.
   */
  const editorBottomReserve = keyboardVisible
    ? keyboardHeight + toolbarHeight
    : toolbarHeight + insets.bottom;

  /**
   * Body padding inside the WebView. Since we resize the WebView container itself,
   * we only need a standard small padding (no extra keyboard overlay coverage).
   */
  const editorScrollInset = 0;

  useEffect(() => {
    directoriesAPI.getUsers().then((res) => {
      setAllUsers(res.data?.data || []);
    }).catch(() => {});

    if (canvasId) {
      loadCanvas(canvasId);
      fetchHistory(canvasId);
    }
    return () => {
      clearActiveCanvas();
    };
  }, [canvasId]);

  const sendEditorCommand = useCallback((command, value = null) => {
    if (webviewRef.current) {
      // Avoid logging high-frequency inset/selection-related traffic
      if (command !== 'setBottomInset') {
        logger.info(`[CanvasEditor] Sending command: ${command}`);
      }
      webviewRef.current.postMessage(JSON.stringify({ command, value }));
    }
  }, []);

  useEffect(() => {
    if (editorReady && activeCanvas && webviewRef.current) {
      const content = activeCanvas.content || '';
      sendEditorCommand('setContent', content);
    }
  }, [editorReady, activeCanvas?._id, sendEditorCommand]);

  // Keep editor theme in sync with the app theme
  useEffect(() => {
    if (editorReady && webviewRef.current) {
      sendEditorCommand('setTheme', isDarkMode ? 'dark' : 'light');
    }
  }, [editorReady, isDarkMode, sendEditorCommand]);

  // Keep caret / content above the sticky format toolbar (and keyboard overlay on iOS).
  useEffect(() => {
    if (!editorReady) return;
    sendEditorCommand('setBottomInset', editorScrollInset);
  }, [editorReady, editorScrollInset, sendEditorCommand]);

  const handleMessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      return;
    }

    switch (data.type) {
      case 'ready':
        setEditorReady(true);
        break;
      case 'selection': {
        // Skip no-op updates — selection fires very often while typing/caret moves
        setSelectionState((prev) => {
          const keys = ['bold', 'italic', 'underline', 'strike', 'code', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'heading', 'table', 'canUndo', 'canRedo'];
          const same = keys.every((k) => prev[k] === data[k]);
          return same ? prev : data;
        });
        break;
      }
      case 'update':
        if (canvasId) {
          updateCanvas(canvasId, { content: data.json });
        }
        break;
      case 'mentionQuery':
        setMentionSearch(data.query || '');
        break;
      case 'mentionClose':
        setMentionSearch(null);
        break;
      case 'error':
        logger.error('[CanvasEditor] WebView ERROR event:', data);
        break;
      case 'setContentAck':
      case 'log':
      case 'focus':
      case 'blur':
        break;
      default:
        break;
    }
  };

  const handleTitleChange = (newTitle) => {
    if (canvasId && newTitle) {
      updateCanvas(canvasId, { title: newTitle });
    }
  };

  useEffect(() => {
    if (mentionSearch === null) return;
    const query = mentionSearch.toLowerCase();
    const matches = allUsers.filter(u =>
      u.username.toLowerCase().includes(query) ||
      (u.fullName && u.fullName.toLowerCase().includes(query))
    ).slice(0, 5);
    setFilteredUsers(matches);
  }, [mentionSearch, allUsers]);

  const handleInsertMention = (user) => {
    sendEditorCommand('insertMention', { id: user._id, label: user.username });
    setMentionSearch(null);
  };

  const handleInsertOption = async (optionType) => {
    if (optionType === 'table') {
      sendEditorCommand('insertTable');
    } else if (optionType === 'hr') {
      sendEditorCommand('insertHorizontalRule');
    } else if (optionType === 'callout') {
      sendEditorCommand('toggleBlockquote');
    } else if (optionType === 'image') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'We need camera roll access to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const formData = new FormData();
        formData.append('files', {
          uri: asset.uri,
          name: asset.fileName || 'upload.jpg',
          type: asset.mimeType || 'image/jpeg',
        });

        try {
          const uploadChannelId = channelId || activeCanvas?.channelId;
          if (!uploadChannelId) {
            Alert.alert('Upload Error', 'No active channel context found for uploading.');
            return;
          }
          const uploadRes = await fileAPI.uploadFiles(uploadChannelId, formData, undefined, true);
          let uploadedUrl = uploadRes.data?.data?.files?.[0]?.secureUrl || uploadRes.data?.data?.files?.[0]?.url || uploadRes.data?.data?.urls?.[0] || uploadRes.data?.url || uploadRes.data?.data?.[0]?.url;

          if (uploadedUrl && !uploadedUrl.startsWith('http')) {
            const prefix = ENV.SOCKET_URL || ENV.API_BASE_URL.replace(/\/api\/.*$/, '');
            uploadedUrl = uploadedUrl.startsWith('/') ? prefix + uploadedUrl : prefix + '/' + uploadedUrl;
          }

          if (uploadedUrl) {
            sendEditorCommand('insertImage', uploadedUrl);
          } else {
            Alert.alert('Upload Failed', 'Failed to retrieve media URL.');
          }
        } catch (err) {
          Alert.alert('Upload Error', 'Error uploading image to server.');
        }
      }
    }
  };

  // Never apply bottom SafeArea here — toolbarBottom owns nav + keyboard insets.
  const screenEdges = ['top', 'left', 'right'];

  return (
    <ScreenLayout edges={screenEdges} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <CanvasHeader
          title={activeCanvas?.title || ''}
          presence={presence}
          commentCount={comments.filter((c) => !c.resolved).length}
          onBack={() => navigation.goBack()}
          onTitleChange={handleTitleChange}
          onCommentsPress={() => setCommentsVisible(true)}
          onHistoryPress={() => {
            fetchHistory(canvasId);
          }}
          onOptionsPress={() => setShareVisible(true)}
        />

        <View style={[styles.editorWrapper, { marginBottom: editorBottomReserve }]}>
          {isLoading && !activeCanvas && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#4f46e5" />
            </View>
          )}
          <WebView
            ref={webviewRef}
            source={{ html: EDITOR_HTML, baseUrl: ENV.SOCKET_URL || 'https://chat-app-api-cyyl.onrender.com' }}
            originWhitelist={['*']}
            style={[styles.webview, { backgroundColor: colors.background }]}
            onMessage={handleMessage}
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            androidLayerType={Platform.OS === 'android' ? 'hardware' : 'none'}
            setBuiltInZoomControls={false}
            setDisplayZoomControls={false}
            overScrollMode="never"
            // Prevent WKWebView from fighting KeyboardStickyView with its own insets.
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
          />
          {mentionSearch !== null && (
            <View style={[styles.mentionPopup, { bottom: 0, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item._id}
                keyboardShouldPersistTaps="always"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.mentionItem, { borderBottomColor: colors.border }]}
                    onPress={() => handleInsertMention(item)}
                  >
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.mentionAvatar} />
                    ) : (
                      <View style={[styles.mentionAvatar, { backgroundColor: colors.surfaceOverlay }]} />
                    )}
                    <Text style={[styles.mentionName, { color: colors.textPrimary }]}>{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        {/* Sticky format toolbar — tracks keyboard animation (no discrete bottom jumps). */}
        <KeyboardStickyView
          pointerEvents="box-none"
          offset={{ closed: -insets.bottom, opened: 0 }}
          style={[
            styles.toolbarDock,
            {
              height: toolbarHeight,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <CanvasFormatToolbar
            selectionState={selectionState}
            onCommand={sendEditorCommand}
            onInsertPress={() => setInsertVisible(true)}
          />
        </KeyboardStickyView>
      </View>

      <CanvasInsertSheet
        visible={insertVisible}
        onClose={() => setInsertVisible(false)}
        onInsertOption={handleInsertOption}
      />

      <CanvasCommentsSheet
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        comments={comments}
        onCreateComment={(content) => createComment(canvasId, null, content)}
        onReplyToComment={replyToComment}
        onResolveComment={resolveComment}
      />

      <CanvasShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        canvasId={canvasId}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  editorWrapper: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  webview: {
    flex: 1,
  },
  toolbarDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  mentionPopup: {
    position: 'absolute',
    left: 0,
    right: 0,
    maxHeight: verticalScale(200),
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 40,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mentionAvatar: {
    width: moderateScale(24),
    height: moderateScale(24),
    borderRadius: moderateScale(12),
    marginRight: scale(8),
  },
  mentionName: {
    fontSize: moderateScale(14),
    fontWeight: '500',
  },
});
