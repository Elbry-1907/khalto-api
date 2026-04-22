// ═══════════════════════════════════════════════════════════
// KHALTO FLUTTER — Security Implementation Guide
// lib/core/security/
// ═══════════════════════════════════════════════════════════

// ── 1. pubspec.yaml additions ─────────────────────────────
/*
dependencies:
  flutter_secure_storage: ^9.0.0      # encrypted keystore
  dio: ^5.4.0                          # with cert pinning
  local_auth: ^2.1.7                   # biometric
  encrypt: ^5.0.1                      # local encryption
  crypto: ^3.0.3                       # hashing
  package_info_plus: ^5.0.1           # version check
  device_info_plus: ^9.1.0            # device fingerprint

dev_dependencies:
  flutter_obfuscate: ^1.0.0           # code obfuscation
*/

// ─────────────────────────────────────────────────────────
// FILE: lib/core/security/secure_storage.dart
// ─────────────────────────────────────────────────────────
/*
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,  // AES-256
      keyCipherAlgorithm: KeyCipherAlgorithm.RSA_ECB_OAEPwithSHA_256andMGF1Padding,
      storageCipherAlgorithm: StorageCipherAlgorithm.AES_GCM_NoPadding,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
      synchronizable: false,  // Don't sync to iCloud
    ),
  );

  // Keys
  static const _kToken   = 'khalto_jwt';
  static const _kRefresh = 'khalto_refresh';
  static const _kBioKey  = 'khalto_bio_key';
  static const _kUserId  = 'khalto_user_id';

  static Future<void>   saveToken(String t)  async => _storage.write(key: _kToken, value: t);
  static Future<String?> getToken()          async => _storage.read(key: _kToken);
  static Future<void>   saveRefresh(String t) async => _storage.write(key: _kRefresh, value: t);
  static Future<String?> getRefresh()        async => _storage.read(key: _kRefresh);
  static Future<void>   saveUserId(String id) async => _storage.write(key: _kUserId, value: id);
  static Future<String?> getUserId()         async => _storage.read(key: _kUserId);

  static Future<void> clearAll() async => _storage.deleteAll();
}
*/

// ─────────────────────────────────────────────────────────
// FILE: lib/core/security/certificate_pinning.dart
// ─────────────────────────────────────────────────────────
/*
import 'package:dio/dio.dart';
import 'dart:io';

class CertificatePinning {
  // SHA-256 fingerprints of khalto.app SSL certificate
  // Update these when certificate renews!
  static const _pins = [
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // Primary cert
    'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', // Backup cert
  ];

  static SecurityContext get securityContext {
    final ctx = SecurityContext.defaultContext;
    // Add your CA certificate for extra pinning
    // ctx.setTrustedCertificatesBytes(certBytes);
    return ctx;
  }

  // For Dio HTTP client
  static void configureDio(Dio dio) {
    (dio.httpClientAdapter as DefaultHttpClientAdapter).onHttpClientCreate = (client) {
      client.badCertificateCallback = (X509Certificate cert, String host, int port) {
        if (!host.contains('khalto.app')) return false;

        // Verify fingerprint
        final fingerprint = cert.sha256.map((b) => b.toRadixString(16).padLeft(2,'0')).join(':');
        final isValid = _pins.any((pin) {
          final pinHex = pin.replaceFirst('sha256/', '');
          return fingerprint.toLowerCase() == pinHex.toLowerCase();
        });

        if (!isValid) {
          // Log security incident
          print('🚨 CERTIFICATE PINNING FAILED for $host');
          return false; // Reject connection
        }
        return true;
      };
      return client;
    };
  }
}
*/

// ─────────────────────────────────────────────────────────
// FILE: lib/core/network/api_client.dart (secure version)
// ─────────────────────────────────────────────────────────
/*
import 'package:dio/dio.dart';
import '../security/certificate_pinning.dart';
import '../security/secure_storage.dart';

class ApiClient {
  static final _dio = Dio(BaseOptions(
    baseUrl: const String.fromEnvironment('API_URL', defaultValue: 'https://api.khalto.app/api/v1'),
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
    headers: {
      'X-Mobile-App': 'true',
      'X-App-Version': '1.0.0',
      'Accept-Language': 'ar',
    },
  ));

  static void init() {
    // Certificate pinning (production only)
    if (const bool.fromEnvironment('dart.vm.product')) {
      CertificatePinning.configureDio(_dio);
    }

    // Auth interceptor
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await SecureStorage.getToken();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';

        // Add request ID for tracking
        options.headers['X-Request-ID'] = DateTime.now().millisecondsSinceEpoch.toString();
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Try refresh token
          final refreshed = await _refreshToken();
          if (refreshed) {
            // Retry original request
            final token = await SecureStorage.getToken();
            error.requestOptions.headers['Authorization'] = 'Bearer $token';
            final response = await _dio.fetch(error.requestOptions);
            return handler.resolve(response);
          } else {
            // Force logout
            await SecureStorage.clearAll();
            // Navigate to login
          }
        }
        handler.next(error);
      },
    ));

    // Logging interceptor (dev only)
    if (!const bool.fromEnvironment('dart.vm.product')) {
      _dio.interceptors.add(LogInterceptor(responseBody: true));
    }
  }

  static Future<bool> _refreshToken() async {
    try {
      final refresh = await SecureStorage.getRefresh();
      if (refresh == null) return false;
      final res = await _dio.post('/auth/refresh', data: {'refresh_token': refresh});
      await SecureStorage.saveToken(res.data['token']);
      await SecureStorage.saveRefresh(res.data['refresh_token']);
      return true;
    } catch { return false; }
  }

  static Dio get instance => _dio;
}
*/

// ─────────────────────────────────────────────────────────
// FILE: lib/core/security/biometric_auth.dart
// ─────────────────────────────────────────────────────────
/*
import 'package:local_auth/local_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';
import 'package:crypto/crypto.dart';

class BiometricAuth {
  static final _auth    = LocalAuthentication();
  static const _storage = FlutterSecureStorage();
  static const _kEnabled = 'bio_enabled';

  // Check if device supports biometric
  static Future<bool> isAvailable() async {
    final canAuth = await _auth.canCheckBiometrics;
    final isDeviceSupported = await _auth.isDeviceSupported();
    return canAuth && isDeviceSupported;
  }

  // Get available biometric types
  static Future<List<BiometricType>> getAvailableTypes() =>
    _auth.getAvailableBiometrics();

  // Authenticate with biometric
  static Future<bool> authenticate({String reason = 'تحقق من هويتك للدخول لخالتو'}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth:    true,
          biometricOnly: false, // Allow PIN fallback
          useErrorDialogs: true,
        ),
      );
    } catch { return false; }
  }

  // Enable biometric for account
  static Future<void> enable(String userId) async {
    await _storage.write(key: _kEnabled, value: userId);
  }

  // Check if biometric is enabled
  static Future<bool> isEnabled() async =>
    (await _storage.read(key: _kEnabled)) != null;

  // Disable biometric
  static Future<void> disable() async =>
    _storage.delete(key: _kEnabled);
}
*/

// ─────────────────────────────────────────────────────────
// BUILD COMMANDS — Obfuscation & Security
// ─────────────────────────────────────────────────────────
/*
# Android Release (obfuscated)
flutter build apk --release \
  --obfuscate \
  --split-debug-info=./debug-info \
  --dart-define=API_URL=https://api.khalto.app \
  --dart-define=dart.vm.product=true

# iOS Release (obfuscated)
flutter build ios --release \
  --obfuscate \
  --split-debug-info=./debug-info \
  --dart-define=API_URL=https://api.khalto.app

# Android App Bundle (Play Store)
flutter build appbundle --release \
  --obfuscate \
  --split-debug-info=./debug-info
*/

// ─────────────────────────────────────────────────────────
// android/app/proguard-rules.pro
// ─────────────────────────────────────────────────────────
/*
# Keep Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Keep Google Maps
-keep class com.google.android.gms.** { *; }

# Keep Firebase
-keep class com.google.firebase.** { *; }

# Obfuscate everything else
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable
-dontusemixedcaseclassnames
-verbose
*/

// ─────────────────────────────────────────────────────────
// android/app/src/main/AndroidManifest.xml — Security flags
// ─────────────────────────────────────────────────────────
/*
<application
  android:allowBackup="false"
  android:fullBackupContent="false"
  android:networkSecurityConfig="@xml/network_security_config"
  android:usesCleartextTraffic="false">  <!-- Block HTTP, HTTPS only -->
*/

// ─────────────────────────────────────────────────────────
// android/app/src/main/res/xml/network_security_config.xml
// ─────────────────────────────────────────────────────────
/*
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">khalto.app</domain>
    <pin-set expiration="2026-01-01">
      <pin digest="SHA-256">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</pin>
      <pin digest="SHA-256">BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=</pin>
    </pin-set>
  </domain-config>
  <debug-overrides>
    <trust-anchors>
      <certificates src="user" overridePins="true"/>
    </trust-anchors>
  </debug-overrides>
</network-security-config>
*/
