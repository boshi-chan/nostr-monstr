package com.nostrmonstr.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

@CapacitorPlugin(name = "WalletStorage")
public class WalletStoragePlugin extends Plugin {
    private static final String TAG = "WalletStorage";
    private static final String PREFS_NAME = "monstr_wallet_secure";
    private SharedPreferences securePrefs;

    private SharedPreferences getSecurePrefs() throws Exception {
        if (securePrefs != null) {
            return securePrefs;
        }

        Context context = getContext();
        if (context == null) {
            throw new IllegalStateException("Context unavailable");
        }

        MasterKey masterKey = new MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();

        securePrefs = EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );

        return securePrefs;
    }

    @PluginMethod
    public void saveWalletBlob(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");

        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }

        try {
            SharedPreferences prefs = getSecurePrefs();
            prefs.edit().putString(key, value).apply();
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to save wallet blob", e);
            call.reject("Failed to save wallet data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void loadWalletBlob(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }

        try {
            SharedPreferences prefs = getSecurePrefs();
            String stored = prefs.getString(key, null);
            JSObject result = new JSObject();
            if (stored != null) {
                result.put("value", stored);
            }
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to load wallet blob", e);
            call.reject("Failed to load wallet data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearWalletBlob(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }

        try {
            SharedPreferences prefs = getSecurePrefs();
            prefs.edit().remove(key).apply();
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to clear wallet blob", e);
            call.reject("Failed to clear wallet data: " + e.getMessage());
        }
    }
}
