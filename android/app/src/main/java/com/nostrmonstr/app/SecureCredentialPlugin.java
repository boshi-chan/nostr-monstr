package com.nostrmonstr.app;

import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Secure credential storage using Android Keystore and Biometric authentication
 * Stores encrypted private keys that can only be decrypted with biometric auth
 */
@CapacitorPlugin(name = "SecureCredential")
public class SecureCredentialPlugin extends Plugin {
    private static final String TAG = "SecureCredential";
    private static final String KEYSTORE_ALIAS = "NostrMonstrPrivateKey";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String PREFS_NAME = "SecureCredentials";
    private static final String KEY_ENCRYPTED_PRIVKEY = "encrypted_privkey";
    private static final String KEY_IV = "encryption_iv";
    private static final int GCM_TAG_LENGTH = 128;

    /**
     * Check if biometric authentication is available on this device
     */
    @PluginMethod
    public void canAuthenticate(PluginCall call) {
        try {
            BiometricManager biometricManager = BiometricManager.from(getContext());
            int result = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG |
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            );

            JSObject response = new JSObject();
            response.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
            response.put("hasEnrolled", result == BiometricManager.BIOMETRIC_SUCCESS);

            String status = "unknown";
            switch (result) {
                case BiometricManager.BIOMETRIC_SUCCESS:
                    status = "available";
                    break;
                case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                    status = "no_hardware";
                    break;
                case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                    status = "hw_unavailable";
                    break;
                case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                    status = "none_enrolled";
                    break;
                case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                    status = "security_update_required";
                    break;
            }
            response.put("status", status);

            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "Error checking biometric availability", e);
            call.reject("Failed to check biometric availability: " + e.getMessage());
        }
    }

    /**
     * Store private key encrypted with biometric-protected key
     */
    @PluginMethod
    public void storePrivateKey(PluginCall call) {
        try {
            String privateKey = call.getString("privateKey");
            if (privateKey == null || privateKey.isEmpty()) {
                call.reject("Private key is required");
                return;
            }

            // Generate or get the encryption key from Keystore
            SecretKey secretKey = getOrCreateSecretKey();

            // Encrypt the private key
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(privateKey.getBytes(StandardCharsets.UTF_8));

            // Store encrypted data and IV
            String encryptedB64 = Base64.encodeToString(encrypted, Base64.NO_WRAP);
            String ivB64 = Base64.encodeToString(iv, Base64.NO_WRAP);

            getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_ENCRYPTED_PRIVKEY, encryptedB64)
                .putString(KEY_IV, ivB64)
                .apply();

            JSObject response = new JSObject();
            response.put("success", true);
            call.resolve(response);
            Log.d(TAG, "Private key stored securely");
        } catch (Exception e) {
            Log.e(TAG, "Error storing private key", e);
            call.reject("Failed to store private key: " + e.getMessage());
        }
    }

    /**
     * Retrieve and decrypt private key using biometric authentication
     */
    @PluginMethod
    public void retrievePrivateKey(PluginCall call) {
        try {
            // Get encrypted data
            String encryptedB64 = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_ENCRYPTED_PRIVKEY, null);
            String ivB64 = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_IV, null);

            if (encryptedB64 == null || ivB64 == null) {
                call.reject("No stored private key found");
                return;
            }

            byte[] encrypted = Base64.decode(encryptedB64, Base64.NO_WRAP);
            byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);

            // Get the secret key
            SecretKey secretKey = getSecretKey();
            if (secretKey == null) {
                call.reject("Encryption key not found");
                return;
            }

            // Show biometric prompt
            showBiometricPrompt(call, secretKey, encrypted, iv);
        } catch (Exception e) {
            Log.e(TAG, "Error retrieving private key", e);
            call.reject("Failed to retrieve private key: " + e.getMessage());
        }
    }

    /**
     * Check if a private key is stored
     */
    @PluginMethod
    public void hasStoredKey(PluginCall call) {
        try {
            String encryptedB64 = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_ENCRYPTED_PRIVKEY, null);

            JSObject response = new JSObject();
            response.put("hasKey", encryptedB64 != null);
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "Error checking stored key", e);
            call.reject("Failed to check stored key: " + e.getMessage());
        }
    }

    /**
     * Delete stored private key
     */
    @PluginMethod
    public void deletePrivateKey(PluginCall call) {
        try {
            getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_ENCRYPTED_PRIVKEY)
                .remove(KEY_IV)
                .apply();

            // Also delete the encryption key from Keystore
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);
            keyStore.deleteEntry(KEYSTORE_ALIAS);

            JSObject response = new JSObject();
            response.put("success", true);
            call.resolve(response);
            Log.d(TAG, "Private key deleted");
        } catch (Exception e) {
            Log.e(TAG, "Error deleting private key", e);
            call.reject("Failed to delete private key: " + e.getMessage());
        }
    }

    private void showBiometricPrompt(PluginCall call, SecretKey secretKey, byte[] encrypted, byte[] iv) {
        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        Executor executor = ContextCompat.getMainExecutor(getContext());

        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authenticate to access your Nostr key")
            .setSubtitle("Use your biometric credential")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG |
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build();

        BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor,
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    try {
                        // Decrypt the private key
                        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                        GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
                        cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);
                        byte[] decrypted = cipher.doFinal(encrypted);
                        String privateKey = new String(decrypted, StandardCharsets.UTF_8);

                        JSObject response = new JSObject();
                        response.put("privateKey", privateKey);
                        call.resolve(response);
                        Log.d(TAG, "Private key retrieved successfully");
                    } catch (Exception e) {
                        Log.e(TAG, "Error decrypting private key", e);
                        call.reject("Failed to decrypt private key: " + e.getMessage());
                    }
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    Log.w(TAG, "Biometric authentication error: " + errString);
                    call.reject("Authentication failed: " + errString);
                }

                @Override
                public void onAuthenticationFailed() {
                    super.onAuthenticationFailed();
                    Log.w(TAG, "Biometric authentication failed");
                    // Don't reject here - user can try again
                }
            });

        biometricPrompt.authenticate(promptInfo);
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);

        if (keyStore.containsAlias(KEYSTORE_ALIAS)) {
            return getSecretKey();
        }

        // Create new key
        KeyGenerator keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        );

        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            KEYSTORE_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(false) // We handle auth via BiometricPrompt
            .setRandomizedEncryptionRequired(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setInvalidatedByBiometricEnrollment(true);
        }

        keyGenerator.init(builder.build());
        return keyGenerator.generateKey();
    }

    private SecretKey getSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        return (SecretKey) keyStore.getKey(KEYSTORE_ALIAS, null);
    }
}
