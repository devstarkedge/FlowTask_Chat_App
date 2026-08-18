import React, { useEffect, useRef, useState, useCallback } from 'react';
import { NativeModules, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { prepareAndroidPdfPreview } from '../../../utils/pdfViewerAssets';
import logger from '../../../utils/logger';

const HAS_NATIVE_PDF = !!NativeModules.PdfManager;

let NativePdf = null;
if (HAS_NATIVE_PDF) {
  try {
    NativePdf = require('react-native-pdf').default;
  } catch {
    // Native PDF module is only available after a dev-client rebuild.
  }
}

const BASE64_FALLBACK_LIMIT = 12 * 1024 * 1024;

function toFileUri(path) {
  if (!path) return null;
  return path.startsWith('file://') ? path : `file://${path}`;
}

function escapeForJsString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export default function AndroidPdfViewer({ localPath, onError }) {
  const webViewRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  const [mode, setMode] = useState(HAS_NATIVE_PDF && NativePdf ? 'native' : 'webview');
  const [webFallback, setWebFallback] = useState('uri');

  const pdfUri = toFileUri(localPath);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const prepared = await prepareAndroidPdfPreview(localPath);
        if (mounted) setViewer(prepared);
      } catch (err) {
        logger.error('[AndroidPdfViewer] Failed to prepare viewer assets', err);
        if (mounted) onError?.(err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [localPath, onError]);

  const injectPdfIntoWebView = useCallback(async () => {
    if (!webViewRef.current || !viewer) return;

    if (webFallback === 'uri') {
      const uri = escapeForJsString(viewer.pdfUri);
      webViewRef.current.injectJavaScript(`
        if (window.renderPdfFromUri) window.renderPdfFromUri('${uri}');
        else window.__pendingPdfUri = '${uri}';
        true;
      `);
      return;
    }

    try {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info?.size && info.size > BASE64_FALLBACK_LIMIT) {
        onError?.(new Error('PDF too large for fallback preview'));
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const escaped = escapeForJsString(base64);
      webViewRef.current.injectJavaScript(`
        if (window.renderPdfFromBase64) window.renderPdfFromBase64('${escaped}');
        else window.__pendingPdfBase64 = '${escaped}';
        true;
      `);
    } catch (err) {
      logger.error('[AndroidPdfViewer] Base64 fallback failed', err);
      onError?.(err);
    }
  }, [localPath, onError, viewer, webFallback]);

  useEffect(() => {
    if (mode !== 'webview' || !viewer || webFallback !== 'base64') return;
    injectPdfIntoWebView();
  }, [mode, viewer, webFallback, injectPdfIntoWebView]);

  const handleWebViewError = () => {
    if (webFallback === 'uri') {
      setWebFallback('base64');
      return;
    }
    onError?.(new Error('WebView PDF preview failed'));
  };

  if (mode === 'native' && NativePdf && pdfUri) {
    return (
      <NativePdf
        source={{ uri: pdfUri, cache: true }}
        style={styles.viewer}
        trustAllCerts
        onError={(err) => {
          logger.warn('[AndroidPdfViewer] Native PDF failed, falling back to WebView', err);
          setMode('webview');
        }}
      />
    );
  }

  if (!viewer?.viewerUri) return null;

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: viewer.viewerUri }}
      style={styles.viewer}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      onLoadEnd={injectPdfIntoWebView}
      onError={handleWebViewError}
      onHttpError={handleWebViewError}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'error') {
            logger.warn('[AndroidPdfViewer] PDF.js error', data.message);
            handleWebViewError();
          }
        } catch {
          // Ignore non-JSON messages
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    backgroundColor: '#525659',
  },
});
