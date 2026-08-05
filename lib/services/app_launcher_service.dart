import 'package:installed_apps/installed_apps.dart';
import 'package:installed_apps/app_info.dart';
import 'package:url_launcher/url_launcher.dart';

class AppLauncherService {
  List<AppInfo>? _cachedApps;

  /// Get all installed apps (cached), including system apps!
  Future<List<AppInfo>> getInstalledApps() async {
    _cachedApps ??= await InstalledApps.getInstalledApps(
      excludeSystemApps: false,
      excludeNonLaunchableApps: false,
    );
    return _cachedApps!;
  }

  /// Clear app cache
  void clearCache() {
    _cachedApps = null;
  }

  /// Find apps matching a query
  Future<List<AppInfo>> searchApps(String query) async {
    final apps = await getInstalledApps();
    final lowerQuery = query.toLowerCase();
    return apps.where((app) {
      return app.name.toLowerCase().contains(lowerQuery);
    }).toList();
  }

  /// Open an app by name (fuzzy match). Uses a known-package shortcut table
  /// for popular apps so launches are fast and case-insensitive.
  Future<String> openApp(String appName) async {
    // Known package shortcuts for popular apps.
    const knownPackages = {
      'youtube': 'com.google.android.youtube',
      'youtube music': 'com.google.android.apps.youtube.music',
      'spotify': 'com.spotify.music',
      'whatsapp': 'com.whatsapp',
      'instagram': 'com.instagram.android',
      'facebook': 'com.facebook.katana',
      'twitter': 'com.twitter.android',
      'x': 'com.twitter.android',
      'tiktok': 'com.zhiliaoapp.musically',
      'chrome': 'com.android.chrome',
      'google': 'com.google.android.googlequicksearchbox',
      'google maps': 'com.google.android.apps.maps',
      'maps': 'com.google.android.apps.maps',
      'gmail': 'com.google.android.gm',
      'settings': 'com.android.settings',
      'phone': 'com.android.dialer',
      'camera': 'com.android.camera',
      'gallery': 'com.android.gallery',
      'photos': 'com.google.android.apps.photos',
      'clock': 'com.google.android.deskclock',
      'calculator': 'com.android.calculator2',
      'calendar': 'com.google.android.calendar',
      'netflix': 'com.netflix.mediaclient',
      'amazon': 'com.amazon.mShop.android.shopping',
      'telegram': 'org.telegram.messenger',
      'discord': 'com.discord',
      'reddit': 'com.reddit.frontpage',
      'linkedin': 'com.linkedin.android',
      'snapchat': 'com.snapchat.android',
      'spotify music': 'com.spotify.music',
      'deezer': 'deezer.android.app',
      'soundcloud': 'com.soundcloud.android',
      'vlc': 'org.videolan.vlc',
    };

    final lowerName = appName.toLowerCase().trim();
    if (knownPackages.containsKey(lowerName)) {
      final pkg = knownPackages[lowerName]!;
      try {
        await InstalledApps.startApp(pkg);
        return 'Opened $appName';
      } catch (e) {
        // Fall through to fuzzy search if the package isn't installed.
      }
    }

    final matches = await searchApps(appName);

    if (matches.isEmpty) {
      return 'Could not find app "$appName". Try being more specific.';
    }

    // Try exact match first
    AppInfo? target;
    for (final app in matches) {
      if (app.name.toLowerCase() == appName.toLowerCase()) {
        target = app;
        break;
      }
    }
    target ??= matches.first;

    try {
      await InstalledApps.startApp(target.packageName);
      return 'Opened ${target.name}';
    } catch (e) {
      return 'Error opening ${target.name}: $e';
    }
  }

  /// Open an app by exact package name
  Future<String> openPackage(String packageName) async {
    try {
      await InstalledApps.startApp(packageName);
      return 'Launched $packageName';
    } catch (e) {
      return 'Error launching $packageName: $e';
    }
  }

  /// Open a URL
  Future<String> openUrl(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        return 'Opened $url';
      }
      return 'Cannot open $url';
    } catch (e) {
      return 'Error opening URL: $e';
    }
  }
}
