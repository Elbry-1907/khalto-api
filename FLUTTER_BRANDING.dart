// ═══════════════════════════════════════════════════════════
// lib/core/branding/branding_service.dart
//
// خدمة البراندينج — تجيب اسم المنصة والشعار والألوان من الـ API
// يُستخدم في كل أجزاء التطبيق
// ═══════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'dart:convert';
import '../network/api_client.dart';
import '../storage/secure_storage.dart';

// ── Branding Model ────────────────────────────────────────
class PlatformBranding {
  final String name;
  final String nameAr;
  final String tagline;
  final String taglineAr;
  final String? logoUrl;
  final String? logoDarkUrl;
  final String? faviconUrl;
  final Color  primaryColor;
  final Color  secondaryColor;
  final Color  accentColor;
  final String? appStoreUrl;
  final String? playStoreUrl;
  final String? supportEmail;
  final String? supportPhone;

  const PlatformBranding({
    required this.name,
    required this.nameAr,
    required this.tagline,
    required this.taglineAr,
    this.logoUrl,
    this.logoDarkUrl,
    this.faviconUrl,
    required this.primaryColor,
    required this.secondaryColor,
    required this.accentColor,
    this.appStoreUrl,
    this.playStoreUrl,
    this.supportEmail,
    this.supportPhone,
  });

  // Default branding (fallback if API fails)
  factory PlatformBranding.defaults() => PlatformBranding(
    name:           'Khalto',
    nameAr:         'خالتو',
    tagline:        'Home-Cooked Food Delivery',
    taglineAr:      'توصيل الأكل البيتي',
    primaryColor:   const Color(0xFFE8603C),
    secondaryColor: const Color(0xFF1a1a2e),
    accentColor:    const Color(0xFFF5A623),
  );

  // From JSON
  factory PlatformBranding.fromJson(Map<String, dynamic> j) {
    Color parseColor(String? hex, Color fallback) {
      if (hex == null || hex.isEmpty) return fallback;
      final h = hex.replaceAll('#', '');
      return Color(int.parse('FF$h', radix: 16));
    }

    return PlatformBranding(
      name:           j['platform_name']       ?? 'Khalto',
      nameAr:         j['platform_name_ar']    ?? 'خالتو',
      tagline:        j['platform_tagline']    ?? '',
      taglineAr:      j['platform_tagline_ar'] ?? '',
      logoUrl:        j['logo_url'],
      logoDarkUrl:    j['logo_dark_url'],
      faviconUrl:     j['favicon_url'],
      primaryColor:   parseColor(j['primary_color'],   const Color(0xFFE8603C)),
      secondaryColor: parseColor(j['secondary_color'], const Color(0xFF1a1a2e)),
      accentColor:    parseColor(j['accent_color'],    const Color(0xFFF5A623)),
      appStoreUrl:    j['app_store_url'],
      playStoreUrl:   j['play_store_url'],
      supportEmail:   j['support_email'],
      supportPhone:   j['support_phone'],
    );
  }

  // Get name based on locale
  String localizedName(Locale locale) =>
    locale.languageCode == 'ar' ? nameAr : name;

  String localizedTagline(Locale locale) =>
    locale.languageCode == 'ar' ? taglineAr : tagline;

  // Generate ThemeData from branding colors
  ThemeData toTheme() => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor:   primaryColor,
      primary:     primaryColor,
      secondary:   accentColor,
      surface:     Colors.white,
      onPrimary:   Colors.white,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: secondaryColor,
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
  );
}

// ── Branding Service ──────────────────────────────────────
class BrandingService extends ChangeNotifier {
  static final BrandingService _instance = BrandingService._internal();
  factory BrandingService() => _instance;
  BrandingService._internal();

  PlatformBranding _branding = PlatformBranding.defaults();
  bool _loaded = false;

  PlatformBranding get branding => _branding;
  bool get isLoaded => _loaded;

  // Platform name shortcut
  String get name    => _branding.name;
  String get nameAr  => _branding.nameAr;
  String get logoUrl => _branding.logoUrl ?? '';
  Color  get primary => _branding.primaryColor;
  Color  get navy    => _branding.secondaryColor;
  Color  get accent  => _branding.accentColor;

  // ── Load from API ───────────────────────────────────────
  Future<void> load({ String? countryId }) async {
    try {
      // Try cache first
      final cached = await _loadFromCache();
      if (cached != null) {
        _branding = cached;
        _loaded   = true;
        notifyListeners();
      }

      // Fetch from API
      final params = countryId != null ? '?country_id=$countryId' : '';
      final res    = await ApiClient.instance.get('/branding$params');
      final data   = res.data['branding'] as Map<String, dynamic>;

      _branding = PlatformBranding.fromJson(data);
      _loaded   = true;

      // Cache result
      await _saveToCache(data);
      notifyListeners();
    } catch (e) {
      // Use defaults if API fails
      _loaded = true;
      notifyListeners();
    }
  }

  // ── Cache helpers ───────────────────────────────────────
  static const _cacheKey = 'platform_branding';

  Future<PlatformBranding?> _loadFromCache() async {
    try {
      final val = await SecureStorage.read(_cacheKey);
      if (val == null) return null;
      final data = jsonDecode(val) as Map<String, dynamic>;
      return PlatformBranding.fromJson(data);
    } catch { return null; }
  }

  Future<void> _saveToCache(Map<String, dynamic> data) async {
    try {
      await SecureStorage.write(_cacheKey, jsonEncode(data));
    } catch { /* ignore */ }
  }

  // ── Force refresh ───────────────────────────────────────
  Future<void> refresh({ String? countryId }) async {
    _loaded = false;
    await load(countryId: countryId);
  }
}

// ── BrandingProvider Widget ───────────────────────────────
// استخدمه في main.dart لتغليف التطبيق
class BrandingProvider extends StatefulWidget {
  final Widget child;
  const BrandingProvider({ super.key, required this.child });

  @override
  State<BrandingProvider> createState() => _BrandingProviderState();
}

class _BrandingProviderState extends State<BrandingProvider> {
  final _service = BrandingService();

  @override
  void initState() {
    super.initState();
    _service.load(); // Load on app start
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _service,
    builder: (_, __) => widget.child,
  );
}

// ── BrandingLogo Widget ───────────────────────────────────
// يعرض اللوغو من الـ URL أو fallback نص
class BrandingLogo extends StatelessWidget {
  final double height;
  final bool dark; // dark = on dark background

  const BrandingLogo({ super.key, this.height = 36, this.dark = false });

  @override
  Widget build(BuildContext context) {
    final branding  = BrandingService().branding;
    final url       = dark ? (branding.logoDarkUrl ?? branding.logoUrl) : branding.logoUrl;

    if (url != null && url.isNotEmpty) {
      return Image.network(
        url,
        height:       height,
        fit:          BoxFit.contain,
        errorBuilder: (_, __, ___) => _textLogo(branding, dark),
        loadingBuilder: (_, child, progress) =>
          progress == null ? child : SizedBox(height: height, width: height * 3),
      );
    }

    return _textLogo(branding, dark);
  }

  Widget _textLogo(PlatformBranding b, bool d) => Text(
    Localizations.localeOf(
      // ignore: use_build_context_synchronously
      // Use nameAr as default for Arabic apps
      null != null ? null as dynamic : null as dynamic
    ) != null ? b.nameAr : b.name,
    style: TextStyle(
      fontSize:   height * 0.65,
      fontWeight: FontWeight.w900,
      color:      d ? Colors.white : b.primaryColor,
      fontFamily: 'Cairo',
    ),
  );
}

// Simpler version — just shows name text
class BrandingNameText extends StatelessWidget {
  final double fontSize;
  final bool dark;

  const BrandingNameText({ super.key, this.fontSize = 22, this.dark = false });

  @override
  Widget build(BuildContext context) {
    final b    = BrandingService().branding;
    final isAr = Localizations.localeOf(context).languageCode == 'ar';
    return RichText(
      text: TextSpan(
        style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w900, fontFamily: 'Cairo'),
        children: [
          TextSpan(
            text:  isAr ? b.nameAr.substring(0, b.nameAr.length ~/ 2) : b.name.substring(0, b.name.length ~/ 2),
            style: TextStyle(color: dark ? Colors.white : b.secondaryColor),
          ),
          TextSpan(
            text:  isAr ? b.nameAr.substring(b.nameAr.length ~/ 2) : b.name.substring(b.name.length ~/ 2),
            style: TextStyle(color: b.primaryColor),
          ),
        ],
      ),
    );
  }
}
