package com.nostrmonstr.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Data;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class NotificationWorker extends Worker {
    public static final String KEY_PUBKEY = "pubkey";
    private static final String TAG = "NotificationWorker";
    private static final String PREFS = "NativeNotificationState";
    private static final long LOOKBACK_SECONDS = 6 * 3600;
    private static final int MAX_NOTIFICATIONS = 3;

    public NotificationWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        final String pubkey = getInputData().getString(KEY_PUBKEY);
        if (pubkey == null || pubkey.length() != 64) {
            Log.w(TAG, "Missing or invalid pubkey for background notifications");
            return Result.success();
        }

        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long lastSeen = prefs.getLong(prefKey(pubkey), 0L);
        long since = lastSeen > 0 ? lastSeen : (System.currentTimeMillis() / 1000L) - LOOKBACK_SECONDS;

        RelayNotificationFetcher fetcher = new RelayNotificationFetcher();
        List<NostrEventPayload> events = fetcher.fetch(pubkey, since);
        if (events.isEmpty()) {
            Log.d(TAG, "No background notifications found for " + shortKey(pubkey));
            return Result.success(new Data.Builder().putString(KEY_PUBKEY, pubkey).build());
        }

        Collections.sort(events, (a, b) -> Long.compare(b.createdAt, a.createdAt));
        long maxStamp = lastSeen;
        int shown = 0;
        for (NostrEventPayload event : events) {
            if (event.createdAt <= lastSeen) {
                continue;
            }
            showNativeNotification(context, event);
            shown++;
            if (event.createdAt > maxStamp) {
                maxStamp = event.createdAt;
            }
            if (shown >= MAX_NOTIFICATIONS) {
                break;
            }
        }

        if (maxStamp > lastSeen) {
            prefs.edit().putLong(prefKey(pubkey), maxStamp).apply();
        }

        return Result.success(new Data.Builder().putString(KEY_PUBKEY, pubkey).build());
    }

    private void showNativeNotification(Context context, NostrEventPayload event) {
        String sender = shortKey(event.pubkey);
        String title;
        String body;

        switch (event.kind) {
            case 4:
                title = "New DM";
                body = sender + " sent you a message";
                break;
            case 7:
                title = "Reaction received";
                body = sender + " reacted with " + (event.content == null || event.content.isEmpty() ? "a like" : event.content);
                break;
            case 9734:
            case 9735:
                title = "Zap received";
                body = sender + " zapped you";
                break;
            case 6:
                title = "Repost";
                body = sender + " reposted you";
                break;
            default:
                title = "Mention";
                String trimmed = event.content != null ? event.content.trim() : "";
                if (trimmed.isEmpty()) {
                    trimmed = "New mention in your feed";
                } else if (trimmed.length() > 120) {
                    trimmed = trimmed.substring(0, 117) + "\u2026";
                }
                body = sender + ": " + trimmed;
                break;
        }

        NotificationHelper.presentNotification(
            context,
            NotificationHelper.DEFAULT_CHANNEL_ID,
            NotificationHelper.DEFAULT_CHANNEL_NAME,
            (int) (System.currentTimeMillis() & 0x7fffffff),
            title,
            body
        );
    }

    private static String prefKey(String pubkey) {
        return "ts_" + pubkey;
    }

    private static String shortKey(String value) {
        if (value == null || value.length() < 12) {
            return value != null ? value : "unknown";
        }
        return value.substring(0, 8) + "\u2026" + value.substring(value.length() - 4);
    }

    private static class RelayNotificationFetcher {
        private static final String[] RELAYS = new String[]{
            "wss://relay.damus.io",
            "wss://relay.nostr.band",
            "wss://nos.lol",
            "wss://relay.nsec.app"
        };
        private static final int[] KINDS = new int[]{1, 4, 6, 7, 9734, 9735};
        private static final int LIMIT = 30;

        List<NostrEventPayload> fetch(String pubkey, long since) {
        List<NostrEventPayload> collected = new ArrayList<>();
        for (String relay : RELAYS) {
            try {
                List<NostrEventPayload> relayEvents = fetchFromRelay(relay, pubkey, since);
                if (!relayEvents.isEmpty()) {
                    collected.addAll(relayEvents);
                    break;
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception err) {
                Log.w(TAG, String.format(Locale.US, "Relay %s fetch failed: %s", relay, err.getMessage()));
            }
        }
        return collected;
    }

        private List<NostrEventPayload> fetchFromRelay(String relayUrl, String pubkey, long since) throws InterruptedException {
            List<NostrEventPayload> events = Collections.synchronizedList(new ArrayList<>());
            CountDownLatch latch = new CountDownLatch(1);
            OkHttpClient client = new OkHttpClient.Builder()
                .readTimeout(10, TimeUnit.SECONDS)
                .callTimeout(15, TimeUnit.SECONDS)
                .build();
            Request request = new Request.Builder().url(relayUrl).build();
            final String subId = "notif-" + System.currentTimeMillis();

            WebSocket ws = client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(@NonNull WebSocket webSocket, @NonNull Response response) {
                    try {
                        JSONObject filter = new JSONObject();
                        JSONArray kinds = new JSONArray();
                        for (int kind : KINDS) {
                            kinds.put(kind);
                        }
                        JSONArray pTags = new JSONArray();
                        pTags.put(pubkey);
                        filter.put("kinds", kinds);
                        filter.put("#p", pTags);
                        filter.put("since", since);
                        filter.put("limit", LIMIT);

                        JSONArray requestPayload = new JSONArray();
                        requestPayload.put("REQ");
                        requestPayload.put(subId);
                        requestPayload.put(filter);
                        webSocket.send(requestPayload.toString());
                    } catch (JSONException err) {
                        Log.w(TAG, "Failed to build request payload", err);
                        latch.countDown();
                    }
                }

                @Override
                public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                    try {
                        JSONArray frame = new JSONArray(text);
                        String type = frame.getString(0);
                        if ("EVENT".equals(type)) {
                            JSONObject rawEvent = frame.getJSONObject(2);
                            NostrEventPayload event = NostrEventPayload.fromJson(rawEvent);
                            if (event != null) {
                                events.add(event);
                            }
                        } else if ("EOSE".equals(type)) {
                            JSONArray closePayload = new JSONArray();
                            closePayload.put("CLOSE");
                            closePayload.put(subId);
                            webSocket.send(closePayload.toString());
                            latch.countDown();
                        }
                    } catch (JSONException err) {
                        Log.w(TAG, "Failed to parse relay message", err);
                    }
                }

                @Override
                public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable t, Response response) {
                    Log.w(TAG, "WebSocket failure for " + relayUrl, t);
                    latch.countDown();
                }

                @Override
                public void onClosed(@NonNull WebSocket webSocket, int code, @NonNull String reason) {
                    latch.countDown();
                }
            });

            latch.await(7, TimeUnit.SECONDS);
            ws.cancel();
            client.dispatcher().executorService().shutdown();
            client.connectionPool().evictAll();
            return events;
        }
    }

    private static class NostrEventPayload {
        final String id;
        final String pubkey;
        final int kind;
        final long createdAt;
        final String content;
        final List<List<String>> tags;

        private NostrEventPayload(String id, String pubkey, int kind, long createdAt, String content, List<List<String>> tags) {
            this.id = id;
            this.pubkey = pubkey;
            this.kind = kind;
            this.createdAt = createdAt;
            this.content = content;
            this.tags = tags;
        }

        static NostrEventPayload fromJson(JSONObject source) {
            try {
                String id = source.getString("id");
                String pubkey = source.getString("pubkey");
                int kind = source.getInt("kind");
                long createdAt = source.optLong("created_at", 0);
                String content = source.optString("content", "");
                JSONArray tagsArray = source.optJSONArray("tags");
                List<List<String>> tags = new ArrayList<>();
                if (tagsArray != null) {
                    for (int i = 0; i < tagsArray.length(); i++) {
                        JSONArray rawTag = tagsArray.optJSONArray(i);
                        if (rawTag == null) continue;
                        List<String> entry = new ArrayList<>();
                        for (int j = 0; j < rawTag.length(); j++) {
                            entry.add(rawTag.optString(j));
                        }
                        tags.add(entry);
                    }
                }
                return new NostrEventPayload(id, pubkey, kind, createdAt, content, tags);
            } catch (JSONException err) {
                Log.w(TAG, "Failed to parse nostr event payload", err);
                return null;
            }
        }
    }
}
