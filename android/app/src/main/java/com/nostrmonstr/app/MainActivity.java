package com.nostrmonstr.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NostrMonstr";
    private static final int REQUEST_CODE_AMBER = 1001;

    // Store pending calls waiting for Amber response
    private PluginCall pendingAmberCall = null;
    private String pendingAmberType = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register Amber plugin before super.onCreate
        registerPlugin(AmberSignerPlugin.class);
        registerPlugin(WalletStoragePlugin.class);
        registerPlugin(NotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_CODE_AMBER) {
            Log.d(TAG, "Amber result received: resultCode=" + resultCode);

            AmberSignerPlugin plugin = (AmberSignerPlugin) getBridge().getPlugin("AmberSigner").getInstance();
            if (plugin != null) {
                plugin.handleAmberResult(resultCode, data);
            }
        }
    }

    /**
     * Capacitor plugin for native Amber signer integration
     * Uses Android Intents for direct IPC with Amber app
     */
    @CapacitorPlugin(name = "AmberSigner")
    public static class AmberSignerPlugin extends Plugin {
        private static final String TAG = "AmberSigner";
        private static final String AMBER_PACKAGE = "com.greenart7c3.nostrsigner";
        private static final String PREFS_NAME = "AmberSignerCache";
        private static final String KEY_CACHED_PUBKEY = "cached_pubkey";
        private PluginCall pendingCall = null;
        private String pendingType = null;
        private SharedPreferences cachePrefs = null;

        private SharedPreferences getCachePrefs() {
            if (cachePrefs == null) {
                cachePrefs = getActivity().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            }
            return cachePrefs;
        }

        private void cachePubkey(String pubkey) {
            if (pubkey == null || pubkey.isEmpty()) return;
            try {
                getCachePrefs().edit().putString(KEY_CACHED_PUBKEY, pubkey).apply();
            } catch (Exception e) {
                Log.w(TAG, "Failed to cache Amber pubkey", e);
            }
        }

        private AmberStatus queryAmberStatus() {
            AmberStatus status = new AmberStatus();
            try {
                PackageManager pm = getActivity().getPackageManager();
                try {
                    PackageInfo info = pm.getPackageInfo(AMBER_PACKAGE, PackageManager.GET_ACTIVITIES);
                    if (info != null) {
                        status.packageFound = true;
                        status.versionName = info.versionName;
                        status.versionCode = (int) info.getLongVersionCode();
                    }
                } catch (PackageManager.NameNotFoundException e) {
                    status.packageFound = false;
                }

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("nostrsigner:"));
                intent.setPackage(AMBER_PACKAGE);
                status.intentAvailable = intent.resolveActivity(pm) != null;
            } catch (Exception e) {
                Log.w(TAG, "Failed to query Amber status", e);
            }
            status.installed = status.packageFound && status.intentAvailable;
            return status;
        }

        @PluginMethod
        public void pingAmber(PluginCall call) {
            AmberStatus status = queryAmberStatus();
            JSObject result = new JSObject();
            result.put("installed", status.installed);
            result.put("packageFound", status.packageFound);
            result.put("intentAvailable", status.intentAvailable);
            if (status.versionName != null) {
                result.put("versionName", status.versionName);
            }
            result.put("versionCode", status.versionCode);
            if (status.installed) {
                result.put("ready", true);
                call.resolve(result);
            } else {
                call.reject("Amber not available");
            }
        }

        private static class AmberStatus {
            boolean packageFound = false;
            boolean intentAvailable = false;
            boolean installed = false;
            String versionName = null;
            int versionCode = 0;
        }

        /**
         * Check if Amber is installed
         */
        @PluginMethod
        public void isAmberInstalled(PluginCall call) {
            try {
                AmberStatus status = queryAmberStatus();
                JSObject result = new JSObject();
                result.put("installed", status.installed);
                result.put("packageFound", status.packageFound);
                result.put("intentAvailable", status.intentAvailable);
                if (status.versionName != null) {
                    result.put("versionName", status.versionName);
                }
                result.put("versionCode", status.versionCode);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Error checking Amber installation", e);
                call.reject("Failed to check Amber installation: " + e.getMessage());
            }
        }

        @PluginMethod
        public void getAmberStatus(PluginCall call) {
            try {
                AmberStatus status = queryAmberStatus();
                JSObject result = new JSObject();
                result.put("installed", status.installed);
                result.put("packageFound", status.packageFound);
                result.put("intentAvailable", status.intentAvailable);
                if (status.versionName != null) {
                    result.put("versionName", status.versionName);
                }
                result.put("versionCode", status.versionCode);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Error getting Amber status", e);
                call.reject("Failed to get Amber status: " + e.getMessage());
            }
        }

        @PluginMethod
        public void getCachedPubkey(PluginCall call) {
            try {
                String cached = getCachePrefs().getString(KEY_CACHED_PUBKEY, null);
                JSObject result = new JSObject();
                if (cached != null) {
                    result.put("pubkey", cached);
                }
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Error reading cached Amber pubkey", e);
                call.reject("Failed to read cached pubkey: " + e.getMessage());
            }
        }

        /**
         * Get public key from Amber
         */
        @PluginMethod
        public void getPublicKey(PluginCall call) {
            try {
                pendingCall = call;
                pendingType = "get_public_key";

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("nostrsigner:"));
                intent.setPackage("com.greenart7c3.nostrsigner");
                intent.putExtra("type", "get_public_key");

                // Add permissions for all Nostr operations
                String permissions = "[" +
                    "{\"type\":\"sign_event\",\"kind\":1}," +
                    "{\"type\":\"sign_event\",\"kind\":4}," +
                    "{\"type\":\"sign_event\",\"kind\":44}," +
                    "{\"type\":\"nip04_encrypt\"}," +
                    "{\"type\":\"nip04_decrypt\"}," +
                    "{\"type\":\"nip44_encrypt\"}," +
                    "{\"type\":\"nip44_decrypt\"}" +
                "]";
                intent.putExtra("permissions", permissions);

                getActivity().startActivityForResult(intent, REQUEST_CODE_AMBER);
                Log.d(TAG, "Launched Amber for get_public_key");
            } catch (Exception e) {
                Log.e(TAG, "Error launching Amber for public key", e);
                call.reject("Failed to launch Amber: " + e.getMessage());
                pendingCall = null;
            }
        }

        /**
         * Sign an event with Amber
         */
        @PluginMethod
        public void signEvent(PluginCall call) {
            try {
                String eventJson = call.getString("event");
                if (eventJson == null || eventJson.isEmpty()) {
                    call.reject("Event JSON is required");
                    return;
                }

                pendingCall = call;
                pendingType = "sign_event";

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("nostrsigner:" + eventJson));
                intent.setPackage("com.greenart7c3.nostrsigner");
                intent.putExtra("type", "sign_event");

                getActivity().startActivityForResult(intent, REQUEST_CODE_AMBER);
                Log.d(TAG, "Launched Amber for sign_event");
            } catch (Exception e) {
                Log.e(TAG, "Error launching Amber for signing", e);
                call.reject("Failed to launch Amber: " + e.getMessage());
                pendingCall = null;
            }
        }

        /**
         * Encrypt with NIP-04
         */
        @PluginMethod
        public void nip04Encrypt(PluginCall call) {
            try {
                String plaintext = call.getString("plaintext");
                String pubkey = call.getString("pubkey");

                if (plaintext == null || pubkey == null) {
                    call.reject("plaintext and pubkey are required");
                    return;
                }

                pendingCall = call;
                pendingType = "nip04_encrypt";

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("nostrsigner:" + plaintext));
                intent.setPackage("com.greenart7c3.nostrsigner");
                intent.putExtra("type", "nip04_encrypt");
                intent.putExtra("pubkey", pubkey);

                getActivity().startActivityForResult(intent, REQUEST_CODE_AMBER);
                Log.d(TAG, "Launched Amber for nip04_encrypt");
            } catch (Exception e) {
                Log.e(TAG, "Error launching Amber for NIP-04 encrypt", e);
                call.reject("Failed to launch Amber: " + e.getMessage());
                pendingCall = null;
            }
        }

        /**
         * Decrypt with NIP-04
         */
        @PluginMethod
        public void nip04Decrypt(PluginCall call) {
            try {
                String ciphertext = call.getString("ciphertext");
                String pubkey = call.getString("pubkey");

                if (ciphertext == null || pubkey == null) {
                    call.reject("ciphertext and pubkey are required");
                    return;
                }

                pendingCall = call;
                pendingType = "nip04_decrypt";

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("nostrsigner:" + ciphertext));
                intent.setPackage("com.greenart7c3.nostrsigner");
                intent.putExtra("type", "nip04_decrypt");
                intent.putExtra("pubkey", pubkey);

                getActivity().startActivityForResult(intent, REQUEST_CODE_AMBER);
                Log.d(TAG, "Launched Amber for nip04_decrypt");
            } catch (Exception e) {
                Log.e(TAG, "Error launching Amber for NIP-04 decrypt", e);
                call.reject("Failed to launch Amber: " + e.getMessage());
                pendingCall = null;
            }
        }

        /**
         * Encrypt with NIP-44
         */
        @PluginMethod
        public void nip44Encrypt(PluginCall call) {
            try {
                String plaintext = call.getString("plaintext");
                String pubkey = call.getString("pubkey");

                if (plaintext == null || pubkey == null) {
                    call.reject("plaintext and pubkey are required");
                    return;
                }

                pendingCall = call;
                pendingType = "nip44_encrypt";

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("nostrsigner:" + plaintext));
                intent.setPackage("com.greenart7c3.nostrsigner");
                intent.putExtra("type", "nip44_encrypt");
                intent.putExtra("pubkey", pubkey);

                getActivity().startActivityForResult(intent, REQUEST_CODE_AMBER);
                Log.d(TAG, "Launched Amber for nip44_encrypt");
            } catch (Exception e) {
                Log.e(TAG, "Error launching Amber for NIP-44 encrypt", e);
                call.reject("Failed to launch Amber: " + e.getMessage());
                pendingCall = null;
            }
        }

        /**
         * Decrypt with NIP-44
         */
        @PluginMethod
        public void nip44Decrypt(PluginCall call) {
            try {
                String ciphertext = call.getString("ciphertext");
                String pubkey = call.getString("pubkey");

                if (ciphertext == null || pubkey == null) {
                    call.reject("ciphertext and pubkey are required");
                    return;
                }

                pendingCall = call;
                pendingType = "nip44_decrypt";

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setData(Uri.parse("nostrsigner:" + ciphertext));
                intent.setPackage("com.greenart7c3.nostrsigner");
                intent.putExtra("type", "nip44_decrypt");
                intent.putExtra("pubkey", pubkey);

                getActivity().startActivityForResult(intent, REQUEST_CODE_AMBER);
                Log.d(TAG, "Launched Amber for nip44_decrypt");
            } catch (Exception e) {
                Log.e(TAG, "Error launching Amber for NIP-44 decrypt", e);
                call.reject("Failed to launch Amber: " + e.getMessage());
                pendingCall = null;
            }
        }

        /**
         * Handle result from Amber
         */
        public void handleAmberResult(int resultCode, Intent data) {
            if (pendingCall == null) {
                Log.w(TAG, "No pending call for Amber result");
                return;
            }

            try {
                if (resultCode != android.app.Activity.RESULT_OK) {
                    pendingCall.reject("User cancelled or Amber returned error");
                    pendingCall = null;
                    return;
                }

                if (data == null) {
                    pendingCall.reject("No data returned from Amber");
                    pendingCall = null;
                    return;
                }

                // Get the result based on type
                String signature = data.getStringExtra("signature");
                String result = data.getStringExtra("result");
                String event = data.getStringExtra("event");
                String pubkey = data.getStringExtra("pubkey");

                Log.d(TAG, "Amber result - type: " + pendingType +
                      ", signature: " + (signature != null ? signature.substring(0, Math.min(8, signature.length())) + "..." : "null") +
                      ", result: " + (result != null ? "present" : "null") +
                      ", pubkey: " + (pubkey != null ? pubkey.substring(0, Math.min(8, pubkey.length())) + "..." : "null"));

                com.getcapacitor.JSObject response = new com.getcapacitor.JSObject();

                switch (pendingType) {
                    case "get_public_key":
                        String resolvedPubkey = null;
                        if (signature != null) {
                            response.put("pubkey", signature);
                            resolvedPubkey = signature;
                        } else if (pubkey != null) {
                            response.put("pubkey", pubkey);
                            resolvedPubkey = pubkey;
                        } else {
                            pendingCall.reject("No public key returned from Amber");
                            pendingCall = null;
                            return;
                        }
                        cachePubkey(resolvedPubkey);
                        break;

                    case "sign_event":
                        if (signature != null) {
                            response.put("signature", signature);
                        }
                        if (event != null) {
                            response.put("event", event);
                        }
                        if (signature == null && event == null) {
                            pendingCall.reject("No signature returned from Amber");
                            pendingCall = null;
                            return;
                        }
                        break;

                    case "nip04_encrypt":
                    case "nip44_encrypt":
                        if (result != null) {
                            response.put("ciphertext", result);
                        } else if (signature != null) {
                            response.put("ciphertext", signature);
                        } else {
                            pendingCall.reject("No encrypted result from Amber");
                            pendingCall = null;
                            return;
                        }
                        break;

                    case "nip04_decrypt":
                    case "nip44_decrypt":
                        if (result != null) {
                            response.put("plaintext", result);
                        } else if (signature != null) {
                            response.put("plaintext", signature);
                        } else {
                            pendingCall.reject("No decrypted result from Amber");
                            pendingCall = null;
                            return;
                        }
                        break;

                    default:
                        pendingCall.reject("Unknown pending type: " + pendingType);
                        pendingCall = null;
                        return;
                }

                pendingCall.resolve(response);
                pendingCall = null;
                pendingType = null;

            } catch (Exception e) {
                Log.e(TAG, "Error handling Amber result", e);
                if (pendingCall != null) {
                    pendingCall.reject("Error processing Amber result: " + e.getMessage());
                    pendingCall = null;
                }
            }
        }
    }
}
