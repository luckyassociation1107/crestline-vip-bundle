package com.crestline.mainnet.admin;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class AmoySyncWorker extends Worker {
    private static final String CHANNEL_ID = "crestline_amoy_sync";
    private static final String[] AMOY_RPCS = new String[]{
        "https://rpc-amoy.polygon.technology",
        "https://polygon-amoy.drpc.org",
        "https://polygon-amoy-bor-rpc.publicnode.com"
    };

    public AmoySyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        for (String rpc : AMOY_RPCS) {
            try {
                URL url = new URL(rpc);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                String body = "{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
                if (conn.getResponseCode() != 200) continue;
                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                }
                JSONObject res = new JSONObject(sb.toString());
                String hexBlock = res.optString("result", "");
                if (hexBlock.startsWith("0x")) {
                    long blk = Long.parseLong(hexBlock.substring(2), 16);
                    SharedPreferences prefs = getApplicationContext().getSharedPreferences("crestline_bg_meta", Context.MODE_PRIVATE);
                    long lastBlk = prefs.getLong("last_amoy_blk", 0L);
                    prefs.edit().putLong("last_amoy_blk", blk).apply();
                    if (lastBlk > 0 && blk > lastBlk + 200) {
                        postSyncNotification(blk);
                    }
                    return Result.success();
                }
            } catch (Exception ignored) {}
        }
        return Result.retry();
    }

    private void postSyncNotification(long blockNum) {
        Context ctx = getApplicationContext();
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Crestline Amoy Sync", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
        NotificationCompat.Builder nb = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Crestline Amoy Sync Ready")
            .setContentText("New Amoy blocks synced (#" + blockNum + "). Open app to view live updates.")
            .setAutoCancel(true);
        nm.notify(80002, nb.build());
    }
}
