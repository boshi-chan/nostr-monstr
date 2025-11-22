package com.nostrmonstr.app;

import android.content.Context;

import android.Manifest;
import android.os.Build;

import androidx.annotation.RequiresApi;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

@CapacitorPlugin(
    name = "NotificationsPlugin",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class NotificationsPlugin extends Plugin {
    private static final String DEFAULT_CHANNEL_ID = NotificationHelper.DEFAULT_CHANNEL_ID;
    private static final String DEFAULT_CHANNEL_NAME = NotificationHelper.DEFAULT_CHANNEL_NAME;
    private static final String WORK_NAME = "MonstrNotificationWorker";

    @PluginMethod
    public void ensureChannel(PluginCall call) {
        String channelId = call.getString("channelId", DEFAULT_CHANNEL_ID);
        String channelName = call.getString("channelName", DEFAULT_CHANNEL_NAME);
        NotificationHelper.ensureChannel(getContext(), channelId, channelName);
        JSObject result = new JSObject();
        result.put("channelId", channelId);
        call.resolve(result);
    }

    @PluginMethod
    public void presentNotification(PluginCall call) {
        String title = call.getString("title", "Monstr");
        String body = call.getString("body", "");
        int notificationId = call.getInt("id", (int) System.currentTimeMillis());
        String channelId = call.getString("channelId", DEFAULT_CHANNEL_ID);
        String channelName = call.getString("channelName", DEFAULT_CHANNEL_NAME);
        String url = call.getString("url", null);

        NotificationHelper.presentNotification(getContext(), channelId, channelName, notificationId, title, body, url);
        JSObject result = new JSObject();
        result.put("id", notificationId);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        if (NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        boolean granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        JSObject result = new JSObject();
        result.put("granted", granted);
        if (granted) {
            call.resolve(result);
        } else {
            call.reject("Notification permission denied");
        }
    }

    @PluginMethod
    public void startBackgroundListener(PluginCall call) {
        String pubkey = call.getString("pubkey");
        if (pubkey == null || pubkey.isEmpty()) {
            call.reject("pubkey is required");
            return;
        }

        NotificationHelper.ensureChannel(getContext(), DEFAULT_CHANNEL_ID, DEFAULT_CHANNEL_NAME);

        Data input = new Data.Builder()
            .putString(NotificationWorker.KEY_PUBKEY, pubkey)
            .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(NotificationWorker.class, 15, java.util.concurrent.TimeUnit.MINUTES)
            .setInputData(input)
            .build();

        WorkManager.getInstance(getContext())
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request);

        JSObject result = new JSObject();
        result.put("scheduled", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopBackgroundListener(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME);
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }
}
