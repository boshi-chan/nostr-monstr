package com.nostrmonstr.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class NotificationHelper {
    public static final String DEFAULT_CHANNEL_ID = "monstr_notifications";
    public static final String DEFAULT_CHANNEL_NAME = "Monstr";

    public static void ensureChannel(Context context, String channelId, String channelName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_DEFAULT);
        channel.enableLights(true);
        channel.setLightColor(Color.parseColor("#F79B5E"));
        channel.enableVibration(true);
        channel.setDescription("Alerts for new DMs, mentions, and wallet activity");
        manager.createNotificationChannel(channel);
    }

    public static void presentNotification(Context context, String channelId, String channelName, int id, String title, String body, String url) {
        ensureChannel(context, channelId, channelName);
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // Add the deep link URL as intent data so the app can navigate to the post
        if (url != null && !url.isEmpty()) {
            intent.putExtra("NOTIFICATION_URL", url);
            intent.putExtra("FROM_NOTIFICATION", true);
            // Also set as action to ensure each notification creates a unique intent
            intent.setAction("OPEN_POST_" + id);
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(context).notify(id, builder.build());
    }
}
