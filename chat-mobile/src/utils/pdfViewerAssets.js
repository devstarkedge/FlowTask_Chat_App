import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import logger from './logger';

const PDF_JS_MODULE = require('../../assets/pdfjs/pdf.min.txt');
const PDF_WORKER_MODULE = require('../../assets/pdfjs/pdf.worker.min.txt');
const VIEWER_DIR = `${FileSystem.cacheDirectory}pdf_preview/`;

export const PDF_VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
  <script src="pdf.min.js"></script>
  <style>
    html, body { margin: 0; padding: 0; background: #525659; }
    #pages { padding: 8px 0 32px; }
    canvas { display: block; width: 100% !important; height: auto !important; margin: 0 auto 8px; background: #fff; }
    #error { display: none; color: #fff; padding: 24px; font-family: sans-serif; text-align: center; }
  </style>
</head>
<body>
  <div id="pages"></div>
  <div id="error">Unable to preview this PDF.</div>
  <script>
    (function () {
      function showError(msg) {
        document.getElementById('error').style.display = 'block';
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: msg || 'render failed' }));
        }
      }

      function renderDocument(getDocumentParams, useMainThread) {
        if (!window.pdfjsLib) {
          showError('PDF library not loaded');
          return;
        }
        try {
          var params = Object.assign({}, getDocumentParams);
          if (useMainThread) {
            params.disableWorker = true;
            params.isEvalSupported = false;
            pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          } else {
            var base = window.location.href.replace(/[^/]+$/, '');
            pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
          }

          pdfjsLib.getDocument(params).promise.then(function (pdf) {
            var container = document.getElementById('pages');
            container.innerHTML = '';
            function renderPage(n) {
              pdf.getPage(n).then(function (page) {
                var viewport = page.getViewport({ scale: 1.35 });
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                container.appendChild(canvas);
                page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                  if (n < pdf.numPages) {
                    renderPage(n + 1);
                  } else if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loaded' }));
                  }
                });
              }).catch(function (err) { showError(err && err.message); });
            }
            renderPage(1);
          }).catch(function (err) {
            var message = (err && err.message) || '';
            if (!useMainThread && /worker/i.test(message)) {
              renderDocument(getDocumentParams, true);
              return;
            }
            showError(message);
          });
        } catch (err) {
          showError(err && err.message);
        }
      }

      window.renderPdfFromUri = function (uri) {
        if (!window.pdfjsLib) {
          window.__pendingPdfUri = uri;
          return;
        }
        renderDocument({ url: uri });
      };

      window.renderPdfFromBase64 = function (b64) {
        if (!window.pdfjsLib) {
          window.__pendingPdfBase64 = b64;
          return;
        }
        try {
          var raw = atob(b64);
          var bytes = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          renderDocument({ data: bytes });
        } catch (err) {
          showError(err && err.message);
        }
      };

      function onPdfJsReady() {
        if (window.__pendingPdfUri) {
          var uri = window.__pendingPdfUri;
          window.__pendingPdfUri = null;
          window.renderPdfFromUri(uri);
        } else if (window.__pendingPdfBase64) {
          var b64 = window.__pendingPdfBase64;
          window.__pendingPdfBase64 = null;
          window.renderPdfFromBase64(b64);
        }
      }

      if (window.pdfjsLib) {
        onPdfJsReady();
      } else {
        var checks = 0;
        var timer = setInterval(function () {
          checks += 1;
          if (window.pdfjsLib) {
            clearInterval(timer);
            onPdfJsReady();
          } else if (checks > 300) {
            clearInterval(timer);
            showError('PDF library load timeout');
          }
        }, 50);
      }
    })();
  </script>
</body>
</html>`;

function toFileUri(path) {
  if (!path) return null;
  return path.startsWith('file://') ? path : `file://${path}`;
}

async function copyAssetToCache(assetModule, destPath) {
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();
  await FileSystem.copyAsync({ from: asset.localUri, to: destPath });
}

async function ensureViewerDir() {
  const dirInfo = await FileSystem.getInfoAsync(VIEWER_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(VIEWER_DIR, { intermediates: true });
  }

  await copyAssetToCache(PDF_JS_MODULE, `${VIEWER_DIR}pdf.min.js`);
  await copyAssetToCache(PDF_WORKER_MODULE, `${VIEWER_DIR}pdf.worker.min.js`);
}

export async function prepareAndroidPdfPreview(pdfPath) {
  if (!pdfPath) throw new Error('Missing PDF path');

  await ensureViewerDir();

  const viewerPath = `${VIEWER_DIR}viewer.html`;
  await FileSystem.writeAsStringAsync(viewerPath, PDF_VIEWER_HTML);

  const pdfUri = toFileUri(pdfPath);
  logger.info('[pdfViewerAssets] Prepared Android PDF preview', { viewerPath, pdfUri });

  return {
    viewerUri: toFileUri(viewerPath),
    pdfUri,
  };
}
