package com.example

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream

class MainActivity : ComponentActivity() {

  companion object {
    private const val VIRTUAL_HOST = "obsidian.local"
    private const val ENTRY_URL = "https://$VIRTUAL_HOST/index.html"
    private const val OBSIDIAN_BG_INT = 0xFF06070A.toInt()
  }

  private var webViewRef: WebView? = null
  private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
  private var pendingExportJson: String? = null

  private val fileChooserLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      val callback = pendingFileCallback
      pendingFileCallback = null
      if (callback == null) return@registerForActivityResult

      if (result.resultCode == Activity.RESULT_OK) {
        val data = result.data
        val uris =
          when {
            data?.clipData != null -> {
              val clip = data.clipData!!
              Array(clip.itemCount) { idx -> clip.getItemAt(idx).uri }
            }
            data?.data != null -> arrayOf(data.data!!)
            else -> null
          }
        callback.onReceiveValue(uris)
      } else {
        callback.onReceiveValue(null)
      }
    }

  private val createJsonDocumentLauncher =
    registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
      val payload = pendingExportJson
      pendingExportJson = null
      if (uri != null && payload != null) {
        try {
          contentResolver.openOutputStream(uri)?.use { out ->
            out.write(payload.toByteArray(Charsets.UTF_8))
          }
          Toast.makeText(this, "Backup saved successfully.", Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
          Toast.makeText(this, "Failed to write JSON backup.", Toast.LENGTH_SHORT).show()
        }
      }
    }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(OBSIDIAN_BG_INT),
      navigationBarStyle = SystemBarStyle.dark(OBSIDIAN_BG_INT),
    )

    setContent {
      BackHandler {
        val wv = webViewRef
        if (wv != null && wv.canGoBack()) {
          wv.goBack()
        } else {
          finish()
        }
      }

      Box(
        modifier =
          Modifier.fillMaxSize()
            .background(Color(0xFF06070A))
            .windowInsetsPadding(WindowInsets.systemBars)
      ) {
        AndroidView(
          modifier = Modifier.fillMaxSize(),
          factory = { ctx ->
            WebView(ctx).apply {
              layoutParams =
                ViewGroup.LayoutParams(
                  ViewGroup.LayoutParams.MATCH_PARENT,
                  ViewGroup.LayoutParams.MATCH_PARENT,
                )
              setBackgroundColor(AndroidColor.parseColor("#06070a"))
              overScrollMode = WebView.OVER_SCROLL_NEVER

              settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                loadWithOverviewMode = true
                useWideViewPort = true
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_DEFAULT
              }

              addJavascriptInterface(AndroidExportBridge(), "AndroidBridge")

              webViewClient =
                object : WebViewClient() {
                  override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?,
                  ): WebResourceResponse? {
                    val uri = request?.url ?: return null
                    if (uri.host != VIRTUAL_HOST) return null
                    return serveOfflineAsset(uri.path ?: "/index.html")
                  }

                  override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?,
                  ): Boolean {
                    val host = request?.url?.host ?: return false
                    return host != VIRTUAL_HOST
                  }
                }

              webChromeClient =
                object : WebChromeClient() {
                  override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?,
                  ): Boolean {
                    pendingFileCallback?.onReceiveValue(null)
                    pendingFileCallback = filePathCallback
                    return try {
                      val intent =
                        fileChooserParams?.createIntent()
                          ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "*/*"
                          }
                      fileChooserLauncher.launch(intent)
                      true
                    } catch (_: Exception) {
                      pendingFileCallback?.onReceiveValue(null)
                      pendingFileCallback = null
                      false
                    }
                  }
                }

              webViewRef = this
              loadUrl(ENTRY_URL)
            }
          },
        )
      }
    }
  }

  private fun serveOfflineAsset(rawPath: String): WebResourceResponse {
    val cleanPath = rawPath.trimStart('/').ifEmpty { "index.html" }
    // Prevent directory traversal
    if (cleanPath.contains("..")) {
      return WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
    }
    return try {
      val stream = assets.open("www/$cleanPath")
      val mime = guessMimeType(cleanPath)
      val headers =
        mapOf(
          "Access-Control-Allow-Origin" to "https://$VIRTUAL_HOST",
          "Cache-Control" to "no-cache",
        )
      WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream)
    } catch (_: Exception) {
      // SPA fallback to index.html for navigation routes
      try {
        val fallback = assets.open("www/index.html")
        WebResourceResponse("text/html", "UTF-8", 200, "OK", emptyMap(), fallback)
      } catch (_: Exception) {
        WebResourceResponse(
          "text/plain",
          "UTF-8",
          404,
          "Not Found",
          emptyMap(),
          ByteArrayInputStream("Asset not found".toByteArray()),
        )
      }
    }
  }

  private fun guessMimeType(path: String): String {
    val lower = path.lowercase()
    return when {
      lower.endsWith(".html") -> "text/html"
      lower.endsWith(".js") || lower.endsWith(".mjs") -> "application/javascript"
      lower.endsWith(".css") -> "text/css"
      lower.endsWith(".json") || lower.endsWith(".webmanifest") -> "application/json"
      lower.endsWith(".svg") -> "image/svg+xml"
      lower.endsWith(".png") -> "image/png"
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
      lower.endsWith(".webp") -> "image/webp"
      lower.endsWith(".woff2") -> "font/woff2"
      lower.endsWith(".woff") -> "font/woff"
      else -> "application/octet-stream"
    }
  }

  inner class AndroidExportBridge {
    @JavascriptInterface
    fun saveJsonBackup(filename: String, jsonPayload: String) {
      runOnUiThread {
        pendingExportJson = jsonPayload
        val safeName = filename.ifBlank { "obsidian-tiers-backup.json" }
        try {
          createJsonDocumentLauncher.launch(safeName)
        } catch (_: Exception) {
          pendingExportJson = null
          Toast.makeText(this@MainActivity, "Could not open file saver.", Toast.LENGTH_SHORT).show()
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    webViewRef?.onResume()
  }

  override fun onPause() {
    webViewRef?.onPause()
    super.onPause()
  }

  override fun onDestroy() {
    pendingFileCallback?.onReceiveValue(null)
    pendingFileCallback = null
    webViewRef?.apply {
      stopLoading()
      destroy()
    }
    webViewRef = null
    super.onDestroy()
  }
}
