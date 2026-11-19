package com.crestline.mainnet.admin;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Debug;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.security.MessageDigest;
import java.util.concurrent.TimeUnit;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.HapticFeedbackConstants;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {
    private static final String APP_ORIGIN_PREFIX = "https://appassets.androidplatform.net/";
    private static final Pattern CSV_NAME_PATTERN =
        Pattern.compile("^crestline-[a-zA-Z0-9._-]{1,40}\\.csv$");
    private static final Pattern HEX64_PATTERN =
        Pattern.compile("^0x[0-9a-fA-F]{64}$");
    private static final Pattern HTTPS_URL_PATTERN =
        Pattern.compile("^https://[a-zA-Z0-9.-]+(:[0-9]{2,5})?(/.*)?$");
    private static final Pattern ALIAS_PATTERN =
        Pattern.compile("^[a-zA-Z0-9._-]{3,80}$");
    private static final Pattern RECOVERY_NAME_PATTERN =
        Pattern.compile("^crestline-recovery-[a-zA-Z0-9._-]{1,40}\\.crestline$");
    private static final Pattern EIP681_PATTERN =
        Pattern.compile("^ethereum:0x[0-9a-fA-F]{40}(@[0-9]+)?/transfer\\?.*$");
    private static final Pattern WC_PATTERN =
        Pattern.compile("^wc:[a-zA-Z0-9-]+@[0-9]+\\?.*$");
    private static final Set<String> ALLOWED_EXTERNAL_HOSTS = new HashSet<>(Arrays.asList(
        "polygonscan.com",
        "amoy.polygonscan.com",
        "faucet.polygon.technology"
    ));

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingExportPayload = null;
    private volatile String currentWebUrl = "";

    private final ActivityResultLauncher<Intent> deviceCredentialLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            boolean ok = result.getResultCode() == Activity.RESULT_OK;
            if (webView != null) {
                webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('crestline-native-auth', { detail: { ok: " + ok + " } }));",
                    null
                ));
            }
        });

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                Uri dataUri = result.getData().getData();
                if (dataUri != null) results = new Uri[]{dataUri};
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        });

    private final ActivityResultLauncher<Intent> createBackupLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            String payload = pendingExportPayload;
            pendingExportPayload = null;
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || payload == null) return;
            Uri dest = result.getData().getData();
            if (dest == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(dest)) {
                if (out != null) {
                    out.write(payload.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "Encrypted .crestline backup saved.", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception ignored) {}
        });

    private boolean isTamperedRuntime() {
        boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        return Debug.isDebuggerConnected() && !isDebuggable;
    }

    private String buildLaunchUrlFromIntent(Intent intent) {
        String base = "https://appassets.androidplatform.net/assets/www/index.html";
        if (intent == null || intent.getData() == null) return base;
        Uri data = intent.getData();
        if (!"crestline".equalsIgnoreCase(data.getScheme()) || !"sync".equalsIgnoreCase(data.getHost())) return base;
        StringBuilder q = new StringBuilder();
        String govTx = data.getQueryParameter("govTx");
        String chkTx = data.getQueryParameter("chkTx");
        String userTx = data.getQueryParameter("userTx");
        if (govTx != null && HEX64_PATTERN.matcher(govTx).matches()) q.append("govTx=").append(govTx);
        if (chkTx != null && HEX64_PATTERN.matcher(chkTx).matches()) {
            if (q.length() > 0) q.append("&");
            q.append("chkTx=").append(chkTx);
        }
        if (userTx != null && HEX64_PATTERN.matcher(userTx).matches()) {
            if (q.length() > 0) q.append("&");
            q.append("userTx=").append(userTx);
        }
        String relayer = data.getQueryParameter("relayer");
        if (relayer != null && HTTPS_URL_PATTERN.matcher(relayer).matches()) {
            if (q.length() > 0) q.append("&");
            q.append("relayer=").append(Uri.encode(relayer));
        }
        String alias = data.getQueryParameter("alias");
        if (alias != null && ALIAS_PATTERN.matcher(alias).matches()) {
            if (q.length() > 0) q.append("&");
            q.append("alias=").append(Uri.encode(alias));
        }
        return q.length() > 0 ? base + "?" + q.toString() : base;
    }

    private boolean isTrustedWebOrigin() {
        return currentWebUrl != null && currentWebUrl.startsWith(APP_ORIGIN_PREFIX);
    }

    private SecretKey getOrCreateHardwareKey(String alias) throws Exception {
        String safeAlias = "crestline_ks_" + alias.replaceAll("[^a-zA-Z0-9_]", "");
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(safeAlias)) {
            KeyStore.Entry entry = ks.getEntry(safeAlias, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
        }
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
            safeAlias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build();
        kg.init(spec);
        return kg.generateKey();
    }

    public class CrestlineAndroidBridge {
        @JavascriptInterface
        public void haptic(String style) {
            if (!isTrustedWebOrigin() || webView == null) return;
            runOnUiThread(() -> {
                int flag = HapticFeedbackConstants.KEYBOARD_TAP;
                if ("success".equals(style) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    flag = HapticFeedbackConstants.CONFIRM;
                } else if ("error".equals(style) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    flag = HapticFeedbackConstants.REJECT;
                }
                webView.performHapticFeedback(flag);
            });
        }

        @JavascriptInterface
        public String getAppSigningSha256() {
            if (!isTrustedWebOrigin()) return "";
            try {
                PackageInfo pi;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    pi = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                    Signature[] sigs = pi.signingInfo != null ? pi.signingInfo.getApkContentsSigners() : null;
                    if (sigs == null || sigs.length == 0) return "";
                    byte[] dig = MessageDigest.getInstance("SHA-256").digest(sigs[0].toByteArray());
                    StringBuilder sb = new StringBuilder();
                    for (byte b : dig) sb.append(String.format("%02x", b));
                    return sb.toString();
                }
                return "";
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean isDeviceSecure() {
            if (!isTrustedWebOrigin()) return false;
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            return km != null && km.isDeviceSecure();
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public boolean authenticateWithDeviceCredential() {
            if (!isTrustedWebOrigin() || isTamperedRuntime()) return false;
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km == null || !km.isDeviceSecure()) return false;
            Intent intent = km.createConfirmDeviceCredentialIntent(
                "Unlock Crestline Vault",
                "Verify your device fingerprint, face, or PIN"
            );
            if (intent == null) return false;
            runOnUiThread(() -> deviceCredentialLauncher.launch(intent));
            return true;
        }

        @JavascriptInterface
        public boolean exportCsvWithPicker(String fileName, String csvContent) {
            if (!isTrustedWebOrigin()) return false;
            if (fileName == null || !CSV_NAME_PATTERN.matcher(fileName).matches()) return false;
            if (csvContent == null || csvContent.length() > 524288) return false;
            pendingExportPayload = csvContent;
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("text/csv");
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                createBackupLauncher.launch(intent);
            });
            return true;
        }

        @JavascriptInterface
        public String sealWithKeystore(String alias, String plaintext) {
            if (!isTrustedWebOrigin() || plaintext == null || plaintext.length() > 4096) return "";
            try {
                SecretKey key = getOrCreateHardwareKey(alias);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, key);
                byte[] iv = cipher.getIV();
                byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
                return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String unsealWithKeystore(String alias, String sealed) {
            if (!isTrustedWebOrigin() || isTamperedRuntime() || sealed == null || !sealed.contains(":")) return "";
            try {
                String[] parts = sealed.split(":", 2);
                byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
                byte[] ct = Base64.decode(parts[1], Base64.NO_WRAP);
                SecretKey key = getOrCreateHardwareKey(alias);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
                return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean exportRecoveryWithPicker(String fileName, String content) {
            if (!isTrustedWebOrigin()) return false;
            if (fileName == null || !RECOVERY_NAME_PATTERN.matcher(fileName).matches()) return false;
            if (content == null || content.length() > 131072) return false;
            try {
                JSONObject obj = new JSONObject(content);
                String fmt = obj.optString("format", "");
                if (!fmt.startsWith("CRESTLINE-VIP-RECOVERY-V")) return false;
                pendingExportPayload = content;
                runOnUiThread(() -> {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/octet-stream");
                    intent.putExtra(Intent.EXTRA_TITLE, fileName);
                    createBackupLauncher.launch(intent);
                });
                return true;
            } catch (Exception e) {
                pendingExportPayload = null;
                return false;
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        window.setStatusBarColor(Color.parseColor("#090B10"));
        window.setNavigationBarColor(Color.parseColor("#090B10"));
        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#090B10"));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.addJavascriptInterface(new CrestlineAndroidBridge(), "CrestlineAndroid");

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams fileChooserParams
            ) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url != null && "https".equalsIgnoreCase(url.getScheme())
                    && "appassets.androidplatform.net".equalsIgnoreCase(url.getHost())) {
                    return assetLoader.shouldInterceptRequest(url);
                }
                return null;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                currentWebUrl = url != null ? url : "";
                super.onPageFinished(view, url);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return true;
                String raw = uri.toString();
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";

                if ("https".equals(scheme) && "appassets.androidplatform.net".equals(host)) {
                    return false;
                }
                if ("https".equals(scheme) && ALLOWED_EXTERNAL_HOSTS.contains(host)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                    return true;
                }
                if (EIP681_PATTERN.matcher(raw).matches() || WC_PATTERN.matcher(raw).matches()) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                    return true;
                }
                return true; // Block all non-allowlisted redirects & cleartext http:// URLs
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
            PeriodicWorkRequest syncWork = new PeriodicWorkRequest.Builder(AmoySyncWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();
            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "crestline_amoy_sync_job",
                ExistingPeriodicWorkPolicy.KEEP,
                syncWork
            );
        } catch (Exception ignored) {}
        currentWebUrl = buildLaunchUrlFromIntent(getIntent());
        webView.loadUrl(currentWebUrl);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null && intent != null && intent.getData() != null) {
            currentWebUrl = buildLaunchUrlFromIntent(intent);
            webView.loadUrl(currentWebUrl);
        }
    }
}
