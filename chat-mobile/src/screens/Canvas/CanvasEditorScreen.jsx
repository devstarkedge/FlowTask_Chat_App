import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
  TouchableOpacity,
  Text,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { useCanvasStore } from '../../stores/canvasStore';
import { fileAPI, directoriesAPI } from '../../services/api';
import CanvasHeader from '../../components/canvas/CanvasHeader';
import CanvasFormatToolbar from '../../components/canvas/CanvasFormatToolbar';
import CanvasInsertSheet from '../../components/canvas/CanvasInsertSheet';
import CanvasCommentsSheet from '../../screens/Canvas/CanvasCommentsSheet';
import CanvasHistorySheet from '../../components/canvas/CanvasHistorySheet';
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

  // Mentions
  const [allUsers, setAllUsers] = useState([]);
  const [mentionSearch, setMentionSearch] = useState(null);
  const [filteredUsers, setFilteredUsers] = useState([]);

  // Sheets visibility
  const [insertVisible, setInsertVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  const {
    activeCanvas,
    comments,
    history,
    presence,
    isLoading,
    loadCanvas,
    updateCanvas,
    clearActiveCanvas,
    fetchComments,
    createComment,
    replyToComment,
    resolveComment,
    fetchHistory,
    restoreVersion,
  } = useCanvasStore();

  useEffect(() => {
    // Fetch users for mentions
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

  // Pass activeCanvas content once ready
  useEffect(() => {
    if (editorReady && activeCanvas && webviewRef.current) {
      logger.info(`[CanvasEditor] Sending setContent for canvas ${activeCanvas._id}, JSON size:`, JSON.stringify(activeCanvas.content || {}).length);
      const content = activeCanvas.content || '';
      sendEditorCommand('setContent', content);
    } else {
      logger.info(`[CanvasEditor] Waiting to set content. editorReady=${editorReady}, activeCanvas=${!!activeCanvas}`);
    }
  }, [editorReady, activeCanvas?._id]);

  const sendEditorCommand = (command, value = null) => {
    if (webviewRef.current) {
      logger.info(`[CanvasEditor] Sending command: ${command}`);
      webviewRef.current.postMessage(JSON.stringify({ command, value }));
    }
  };

  const handleMessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      logger.warn('[CanvasEditor] Failed to parse WebView message:', event.nativeEvent.data);
      return;
    }

    switch (data.type) {
      case 'ready':
        logger.info(`[CanvasEditor] WebView Ready. BodyHeight: ${data.bodyHeight}, WindowHeight: ${data.windowHeight}, UA: ${data.userAgent}`);
        setEditorReady(true);
        break;
      case 'selection':
        setSelectionState(data);
        break;
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
        logger.info('[CanvasEditor] WebView acknowledged setContent:', data);
        break;
      case 'log':
        logger.info('[CanvasEditor WebView Log]:', data.message);
        break;
      default:
        logger.info(`[CanvasEditor] Unhandled WebView event type: ${data.type}`);
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
          uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
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

  return (
    <SafeAreaView style={styles.container}>
      <CanvasHeader
        title={activeCanvas?.title || ''}
        presence={presence}
        commentCount={comments.filter((c) => !c.resolved).length}
        onBack={() => navigation.goBack()}
        onTitleChange={handleTitleChange}
        onCommentsPress={() => setCommentsVisible(true)}
        onHistoryPress={() => {
          fetchHistory(canvasId);
          setHistoryVisible(true);
        }}
        onOptionsPress={() => setShareVisible(true)}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.editorWrapper}>
          {isLoading && !activeCanvas && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#4f46e5" />
            </View>
          )}
          <WebView
            ref={webviewRef}
            source={{ html: EDITOR_HTML, baseUrl: ENV.SOCKET_URL || 'https://chat-app-api-cyyl.onrender.com' }}
            originWhitelist={['*']}
            style={styles.webview}
            onMessage={handleMessage}
            keyboardDisplayRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            androidLayerType={Platform.OS === 'android' ? 'hardware' : 'none'}
          />
          {mentionSearch !== null && (
            <View style={styles.mentionPopup}>
              <FlatList
                data={filteredUsers}
                keyExtractor={(item) => item._id}
                keyboardShouldPersistTaps="always"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.mentionItem}
                    onPress={() => handleInsertMention(item)}
                  >
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={styles.mentionAvatar} />
                    ) : (
                      <View style={[styles.mentionAvatar, { backgroundColor: '#e2e8f0' }]} />
                    )}
                    <Text style={styles.mentionName}>{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        <CanvasFormatToolbar
          selectionState={selectionState}
          onCommand={sendEditorCommand}
          onInsertPress={() => setInsertVisible(true)}
        />
      </KeyboardAvoidingView>

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

      <CanvasHistorySheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        history={history}
        onRestore={(historyId) => restoreVersion(canvasId, historyId)}
      />

      <CanvasShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        canvasId={canvasId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  keyboardContainer: {
    flex: 1,
  },
  editorWrapper: {
    flex: 1,
    position: 'relative',
    height: '100%',
  },
  webview: {
    flex: 1,
    height: '100%',
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
    bottom: verticalScale(0),
    left: scale(0),
    right: scale(0),
    maxHeight: verticalScale(200),
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: scale(0), height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 50,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: moderateScale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  mentionAvatar: {
    width: scale(24),
    height: verticalScale(24),
    borderRadius: moderateScale(12),
    marginRight: scale(8),
  },
  mentionName: {
    fontSize: moderateScale(14),
    color: '#1f2937',
    fontWeight: '500',
  },
});
