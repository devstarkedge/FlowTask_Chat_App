import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { useCanvasStore } from '../../stores/canvasStore';
import { fileAPI } from '../../services/api';
import CanvasHeader from '../../components/canvas/CanvasHeader';
import CanvasFormatToolbar from '../../components/canvas/CanvasFormatToolbar';
import CanvasInsertSheet from '../../components/canvas/CanvasInsertSheet';
import CanvasCommentsSheet from '../../screens/Canvas/CanvasCommentsSheet';
import CanvasHistorySheet from '../../components/canvas/CanvasHistorySheet';
import CanvasShareModal from '../../screens/Canvas/CanvasShareModal';
import { EDITOR_HTML } from './EditorHtml';

export default function CanvasEditorScreen({ route, navigation }) {
  const { canvasId, channelId } = route.params || {};
  const webviewRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);
  const [selectionState, setSelectionState] = useState({});

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
      // activeCanvas.content is a TipTap JSON doc object (e.g. { type: "doc", content: [...] })
      // Send the raw object directly — postMessage will serialize it, and the editor will parse
      // it back. TipTap's setContent() natively accepts JSON doc objects.
      const content = activeCanvas.content || '';
      sendEditorCommand('setContent', content);
    }
  }, [editorReady, activeCanvas?._id]);

  const sendEditorCommand = (command, value = null) => {
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ command, value }));
    }
  };

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
      case 'selection':
        setSelectionState(data);
        break;
      case 'update':
        // Save updates (content json/html)
        if (canvasId) {
          updateCanvas(canvasId, { content: data.json });
        }
        break;
      case 'error':
        console.warn('[CanvasEditor] WebView error:', data.message);
        break;
    }
  };

  const handleTitleChange = (newTitle) => {
    if (canvasId && newTitle) {
      updateCanvas(canvasId, { title: newTitle });
    }
  };

  const handleInsertOption = async (optionType) => {
    if (optionType === 'table') {
      sendEditorCommand('insertTable');
    } else if (optionType === 'hr') {
      sendEditorCommand('insertHorizontalRule');
    } else if (optionType === 'callout') {
      // Callout nodes are configured inTipTap. Let's send toggleBlockquote as fallback if custom callout wrapper is complex
      sendEditorCommand('toggleBlockquote');
    } else if (optionType === 'image') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'We need camera roll access to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: asset.fileName || 'upload.jpg',
          type: asset.mimeType || 'image/jpeg',
        });

        try {
          const uploadRes = await fileAPI.uploadFiles(channelId, formData);
          const uploadedUrl = uploadRes.data?.data?.[0]?.url || uploadRes.data?.url;
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
        onHistoryPress={() => setHistoryVisible(true)}
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
            source={{ html: EDITOR_HTML }}
            originWhitelist={['*']}
            style={styles.webview}
            onMessage={handleMessage}
            keyboardDisplayRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
          />
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
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
