// ═══════════════════════════════════════════════════════════
// KHALTO FLUTTER — Complete Dynamic Branding
// اطبّق هذا الكود في كل التطبيقات الثلاثة
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// 1. lib/core/branding/branding_model.dart
// ─────────────────────────────────────────────────────────
/*
import 'package:flutter/material.dart';

class PlatformBranding {
  final String name;
  final String nameAr;
  final String tagline;
  final String taglineAr;
  final String? logoUrl;
  final String? logoDarkUrl;
  final Color primaryColor;
  final Color secondaryColor;
  final Color accentColor;
  final String? supportEmail;
  final String? supportPhone;
  final String? appStoreUrl;
  final String? playStoreUrl;

  const PlatformBranding({
    required this.name,
    required this.nameAr,
    this.tagline = '',
    this.taglineAr = '',
    this.logoUrl,
    this.logoDarkUrl,
    required this.primaryColor,
    required this.secondaryColor,
    required this.accentColor,
    this.supportEmail,
    this.supportPhone,
    this.appStoreUrl,
    this.playStoreUrl,
  });

  // ── Default (Khalto) ──────────────────────────────────
  static const PlatformBranding defaults = PlatformBranding(
    name:           'Khalto',
    nameAr:         'خالتو',
    tagline:        'Home-Cooked Food Delivery',
    taglineAr:      'توصيل الأكل البيتي',
    primaryColor:   Color(0xFFE8603C),
    secondaryColor: Color(0xFF1a1a2e),
    accentColor:    Color(0xFFF5A623),
  );

  // ── From JSON ─────────────────────────────────────────
  factory PlatformBranding.fromJson(Map<String, dynamic> j) {
    Color hex(String? s, Color fallback) {
      if (s == null || s.isEmpty) return fallback;
      try {
        return Color(int.parse('FF${s.replaceAll("#", "")}', radix: 16));
      } catch { return fallback; }
    }
    return PlatformBranding(
      name:           j['platform_name']       ?? 'Platform',
      nameAr:         j['platform_name_ar']    ?? 'المنصة',
      tagline:        j['platform_tagline']    ?? '',
      taglineAr:      j['platform_tagline_ar'] ?? '',
      logoUrl:        j['logo_url'],
      logoDarkUrl:    j['logo_dark_url'],
      primaryColor:   hex(j['primary_color'],   const Color(0xFFE8603C)),
      secondaryColor: hex(j['secondary_color'], const Color(0xFF1a1a2e)),
      accentColor:    hex(j['accent_color'],    const Color(0xFFF5A623)),
      supportEmail:   j['support_email'],
      supportPhone:   j['support_phone'],
      appStoreUrl:    j['app_store_url'],
      playStoreUrl:   j['play_store_url'],
    );
  }

  // ── Localized getters ─────────────────────────────────
  String localName(BuildContext ctx) =>
    Localizations.localeOf(ctx).languageCode == 'ar' ? nameAr : name;

  String localTagline(BuildContext ctx) =>
    Localizations.localeOf(ctx).languageCode == 'ar' ? taglineAr : tagline;

  // ── Generate full ThemeData ───────────────────────────
  ThemeData get theme => ThemeData(
    useMaterial3: true,
    fontFamily: 'Cairo',
    colorScheme: ColorScheme.fromSeed(
      seedColor:  primaryColor,
      primary:    primaryColor,
      secondary:  accentColor,
      onPrimary:  Colors.white,
      surface:    Colors.white,
    ),
    scaffoldBackgroundColor: const Color(0xFFF8F9FC),
    appBarTheme: AppBarTheme(
      backgroundColor: secondaryColor,
      foregroundColor: Colors.white,
      elevation:       0,
      centerTitle:     false,
      titleTextStyle:  const TextStyle(
        fontFamily:  'Cairo',
        fontSize:    18,
        fontWeight:  FontWeight.w900,
        color:       Colors.white,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor:  primaryColor,
        foregroundColor:  Colors.white,
        minimumSize:      const Size(double.infinity, 52),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        textStyle: const TextStyle(
          fontFamily:  'Cairo',
          fontSize:    15,
          fontWeight:  FontWeight.w800,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: primaryColor),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled:      true,
      fillColor:   Colors.white,
      border: OutlineInputBorder(
        borderRadius:  BorderRadius.circular(12),
        borderSide:    const BorderSide(color: Color(0xFFEEEEEE)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide:   const BorderSide(color: Color(0xFFEEEEEE)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide:   BorderSide(color: primaryColor, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    cardTheme: CardTheme(
      color:       Colors.white,
      elevation:   0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side:         const BorderSide(color: Color(0xFFEEEEEE)),
      ),
    ),
    chipTheme: ChipThemeData(
      selectedColor: primaryColor.withOpacity(0.15),
      labelStyle:    const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w700),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor:   Colors.white,
      selectedItemColor: primaryColor,
      unselectedItemColor: const Color(0xFFBBBBBB),
      type:              BottomNavigationBarType.fixed,
      elevation:         8,
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: primaryColor,
      foregroundColor: Colors.white,
    ),
  );
}
*/

// ─────────────────────────────────────────────────────────
// 2. lib/core/branding/branding_controller.dart
// ─────────────────────────────────────────────────────────
/*
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:dio/dio.dart';
import 'branding_model.dart';

class BrandingController extends ChangeNotifier {
  static final BrandingController _i = BrandingController._();
  factory BrandingController() => _i;
  BrandingController._();

  PlatformBranding _b = PlatformBranding.defaults;
  bool _ready = false;

  PlatformBranding get branding     => _b;
  bool             get isReady      => _ready;
  Color            get primary      => _b.primaryColor;
  Color            get navy         => _b.secondaryColor;
  Color            get accent       => _b.accentColor;
  String           get name         => _b.name;
  String           get nameAr       => _b.nameAr;
  String?          get logoUrl      => _b.logoUrl;
  ThemeData        get theme        => _b.theme;

  // ── Initialize ────────────────────────────────────────
  Future<void> init({ String? countryId }) async {
    // 1. Load from cache first (instant)
    final cached = await _fromCache();
    if (cached != null) {
      _b = cached; _ready = true; notifyListeners();
    }

    // 2. Fetch from API (background)
    try {
      final dio = Dio(BaseOptions(
        baseUrl: const String.fromEnvironment('API_URL',
          defaultValue: 'http://localhost:3000/api/v1'),
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 8),
      ));
      final res = await dio.get(
        '/branding${countryId != null ? "?country_id=$countryId" : ""}',
      );
      final data = res.data['branding'] as Map<String, dynamic>;
      _b = PlatformBranding.fromJson(data);
      _ready = true;
      await _toCache(data);
      notifyListeners();
    } catch (e) {
      // Keep cached/default — don't crash
      _ready = true;
      notifyListeners();
    }
  }

  Future<void> refresh({ String? countryId }) async {
    _ready = false;
    await init(countryId: countryId);
  }

  // ── Cache ─────────────────────────────────────────────
  static const _key = 'khalto_branding_v1';

  Future<PlatformBranding?> _fromCache() async {
    try {
      final p   = await SharedPreferences.getInstance();
      final raw = p.getString(_key);
      if (raw == null) return null;
      return PlatformBranding.fromJson(
        jsonDecode(raw) as Map<String, dynamic>
      );
    } catch { return null; }
  }

  Future<void> _toCache(Map<String, dynamic> data) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_key, jsonEncode(data));
    } catch { /* ignore */ }
  }
}
*/

// ─────────────────────────────────────────────────────────
// 3. lib/main.dart — استخدام البراندينج
// ─────────────────────────────────────────────────────────
/*
import 'package:flutter/material.dart';
import 'core/branding/branding_controller.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize branding BEFORE runApp
  await BrandingController().init();

  runApp(const KhaltoApp());
}

class KhaltoApp extends StatelessWidget {
  const KhaltoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: BrandingController(),
      builder: (_, __) {
        final ctrl = BrandingController();
        return MaterialApp(
          title:        ctrl.name,
          theme:        ctrl.theme,   // ← ثيم ديناميكي كامل
          // ... routes etc
        );
      },
    );
  }
}
*/

// ─────────────────────────────────────────────────────────
// 4. lib/core/branding/branding_widgets.dart
// ─────────────────────────────────────────────────────────
/*
import 'package:flutter/material.dart';
import 'branding_controller.dart';
import 'branding_model.dart';

// ── Platform Logo ─────────────────────────────────────────
class KhaltoLogo extends StatelessWidget {
  final double height;
  final bool   onDark;
  const KhaltoLogo({ super.key, this.height = 32, this.onDark = false });

  @override
  Widget build(BuildContext context) {
    final ctrl = BrandingController();
    final url  = onDark
      ? (ctrl.branding.logoDarkUrl ?? ctrl.branding.logoUrl)
      : ctrl.branding.logoUrl;

    if (url != null && url.isNotEmpty) {
      return Image.network(
        url, height: height, fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => _textLogo(context, ctrl.branding, onDark),
      );
    }
    return _textLogo(context, ctrl.branding, onDark);
  }

  Widget _textLogo(BuildContext ctx, PlatformBranding b, bool dark) {
    final isAr = Localizations.localeOf(ctx).languageCode == 'ar';
    final n    = isAr ? b.nameAr : b.name;
    final mid  = (n.length / 2).ceil();
    return RichText(
      text: TextSpan(
        style: TextStyle(
          fontSize:   height * 0.7,
          fontWeight: FontWeight.w900,
          fontFamily: 'Cairo',
        ),
        children: [
          TextSpan(
            text:  n.substring(0, mid),
            style: TextStyle(color: dark ? Colors.white : b.secondaryColor),
          ),
          TextSpan(
            text:  n.substring(mid),
            style: TextStyle(color: b.primaryColor),
          ),
        ],
      ),
    );
  }
}

// ── Primary Button with brand color ──────────────────────
class KhaltoButton extends StatelessWidget {
  final String   label;
  final VoidCallback? onPressed;
  final bool     loading;
  const KhaltoButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = BrandingController().primary;
    return SizedBox(
      width:  double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed:  loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor:  color,
          disabledBackgroundColor: color.withOpacity(0.6),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: loading
          ? const SizedBox(width: 22, height: 22,
              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
          : Text(label, style: const TextStyle(
              fontFamily:  'Cairo',
              fontSize:    15,
              fontWeight:  FontWeight.w800,
              color:       Colors.white,
            )),
      ),
    );
  }
}

// ── AppBar with brand color ───────────────────────────────
class KhaltoAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final bool showLogo;
  const KhaltoAppBar({
    super.key,
    this.title = '',
    this.actions,
    this.showLogo = false,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final navy = BrandingController().navy;
    return AppBar(
      backgroundColor: navy,
      foregroundColor: Colors.white,
      title:   showLogo
        ? const KhaltoLogo(height: 28, onDark: true)
        : Text(title, style: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w900)),
      actions: actions,
    );
  }
}

// ── Brand color chip ──────────────────────────────────────
class BrandChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  const BrandChip({ super.key, required this.label, this.selected = false, this.onTap });

  @override
  Widget build(BuildContext context) {
    final primary = BrandingController().primary;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color:        selected ? primary : primary.withOpacity(0.08),
          borderRadius: BorderRadius.circular(20),
          border:       Border.all(color: selected ? primary : primary.withOpacity(0.2)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color:      selected ? Colors.white : primary,
            fontFamily: 'Cairo',
            fontWeight: FontWeight.w700,
            fontSize:   12,
          ),
        ),
      ),
    );
  }
}

// ── Loading indicator with brand color ───────────────────
class KhaltoLoader extends StatelessWidget {
  final double size;
  const KhaltoLoader({ super.key, this.size = 24 });

  @override
  Widget build(BuildContext context) => Center(
    child: SizedBox(
      width:  size, height: size,
      child:  CircularProgressIndicator(
        color:       BrandingController().primary,
        strokeWidth: 2.5,
      ),
    ),
  );
}

// ── Splash screen with dynamic branding ──────────────────
class BrandedSplashScreen extends StatefulWidget {
  final Widget child;
  const BrandedSplashScreen({ super.key, required this.child });

  @override
  State<BrandedSplashScreen> createState() => _BrandedSplashScreenState();
}

class _BrandedSplashScreenState extends State<BrandedSplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _anim;
  late Animation<double>   _fade;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _fade = CurvedAnimation(parent: _anim, curve: Curves.easeIn);
    _anim.forward();

    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => widget.child),
      );
    });
  }

  @override
  void dispose() { _anim.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final ctrl = BrandingController();
    return Scaffold(
      backgroundColor: ctrl.navy,
      body: FadeTransition(
        opacity: _fade,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const KhaltoLogo(height: 60, onDark: true),
              const SizedBox(height: 12),
              Text(
                ctrl.branding.taglineAr,
                style: TextStyle(
                  color:      Colors.white.withOpacity(0.6),
                  fontSize:   14,
                  fontFamily: 'Cairo',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
*/

// ─────────────────────────────────────────────────────────
// 5. طريقة الاستخدام في أي شاشة
// ─────────────────────────────────────────────────────────
/*
// بدل:
Color primaryColor = const Color(0xFFE8603C);  // ❌ hardcoded

// استخدم:
Color primaryColor = BrandingController().primary;  // ✅ dynamic

// بدل:
Text('خالتو')  // ❌ hardcoded

// استخدم:
Text(BrandingController().nameAr)  // ✅ dynamic

// AppBar:
appBar: KhaltoAppBar(showLogo: true)  // ✅ logo ديناميكي

// Splash:
home: BrandedSplashScreen(child: HomeScreen())  // ✅ splash ديناميكي

// Theme في MaterialApp:
theme: BrandingController().theme  // ✅ ثيم كامل ديناميكي
*/
