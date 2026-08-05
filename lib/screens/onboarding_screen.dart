import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import 'dart:ui';
import '../config/feature_flags.dart';
import '../services/screen_automation_service.dart';
import 'home_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen>
    with WidgetsBindingObserver {
  final PageController _pageController = PageController();
  final ScreenAutomationService _screenAutomationService =
      ScreenAutomationService();

  int _currentStep = 0;
  bool _isAccessibilityGranted = false;
  bool _isMicrophoneGranted = false;
  bool _isNotificationsGranted = false;
  bool _isContactsGranted = false;
  bool _isPhoneGranted = false;
  bool _isSmsGranted = false;
  bool _isOverlayGranted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkPermissions();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pageController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkPermissions();
    }
  }

  Future<void> _checkPermissions() async {
    final accessibilityRunning = await _screenAutomationService
        .isServiceRunning();
    final microphoneStatus = await Permission.microphone.status;
    final notificationsStatus = await Permission.notification.status;
    final contactsStatus = await Permission.contacts.status;
    final phoneStatus = await Permission.phone.status;
    final smsStatus = await Permission.sms.status;
    final overlayGranted = FeatureFlags.floatingOverlayEnabled
        ? await FlutterOverlayWindow.isPermissionGranted()
        : false;

    if (mounted) {
      setState(() {
        _isAccessibilityGranted = accessibilityRunning;
        _isMicrophoneGranted = microphoneStatus.isGranted;
        _isNotificationsGranted = notificationsStatus.isGranted;
        _isContactsGranted = contactsStatus.isGranted;
        _isPhoneGranted = phoneStatus.isGranted;
        _isSmsGranted = smsStatus.isGranted;
        _isOverlayGranted = overlayGranted;
      });
    }
  }

  Future<void> _requestPermission(Permission permission) async {
    await permission.request();
    _checkPermissions();
  }

  Future<void> _requestAccessibility() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Enable Screen Control'),
        content: const Text(
          'If Android shows “Restricted setting”, open App Info first, tap the '
          'three-dot menu, and choose “Allow restricted settings”. Then return '
          'and open Accessibility Settings to enable Beatrice OS Screen Control.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              _screenAutomationService.openAccessibilitySettings();
            },
            child: const Text('Accessibility Settings'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              openAppSettings();
            },
            child: const Text('Open App Info First'),
          ),
        ],
      ),
    );
  }

  Future<void> _requestOverlayPermission() async {
    if (!FeatureFlags.floatingOverlayEnabled) return;
    bool granted = await FlutterOverlayWindow.isPermissionGranted();
    if (!granted) {
      await FlutterOverlayWindow.requestPermission();
      granted = await FlutterOverlayWindow.isPermissionGranted();
    }
    setState(() {
      _isOverlayGranted = granted;
    });
  }

  bool get _canProceedToModel {
    return _isAccessibilityGranted &&
        _isMicrophoneGranted &&
        (!FeatureFlags.floatingOverlayEnabled || _isOverlayGranted);
  }

  /// Completes onboarding and launches the app. The AI provider is already
  /// pre-configured with sane defaults (Gemini), and the API key is loaded
  /// from the bundled local config at runtime, so no manual setup step is
  /// required.
  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_completed', true);
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const HomeScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark
          ? const Color(0xFF0B0F19)
          : const Color(0xFFF8FAFC),
      body: Stack(
        children: [
          // Background fluid glow effect
          _buildBackgroundGlows(isDark),

          // Blur filter over background glows
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 120, sigmaY: 120),
              child: Container(color: Colors.transparent),
            ),
          ),

          SafeArea(
            child: Column(
              children: [
                // Top Custom Animated Stepper Bar
                Padding(
                  padding: const EdgeInsets.only(
                    top: 24,
                    left: 32,
                    right: 32,
                    bottom: 8,
                  ),
                  child: _buildAnimatedStepper(isDark),
                ),

                Expanded(
                  child: PageView(
                    controller: _pageController,
                    physics: const NeverScrollableScrollPhysics(),
                    onPageChanged: (page) {
                      setState(() {
                        _currentStep = page;
                      });
                    },
                    children: [
                      _buildWelcomePage(isDark),
                      _buildPermissionsPage(isDark),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBackgroundGlows(bool isDark) {
    return Positioned.fill(
      child: Stack(
        children: [
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 350,
              height: 350,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    isDark
                        ? const Color(0xFF6366F1).withOpacity(0.18)
                        : const Color(0xFF4F46E5).withOpacity(0.08),
                    isDark
                        ? const Color(0xFF6366F1).withOpacity(0)
                        : const Color(0xFF4F46E5).withOpacity(0),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -50,
            left: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    isDark
                        ? const Color(0xFF38BDF8).withOpacity(0.15)
                        : const Color(0xFF0EA5E9).withOpacity(0.06),
                    isDark
                        ? const Color(0xFF38BDF8).withOpacity(0)
                        : const Color(0xFF0EA5E9).withOpacity(0),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnimatedStepper(bool isDark) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(3, (index) {
            final isActive = _currentStep == index;
            final isCompleted = _currentStep > index;

            return AnimatedContainer(
              duration: const Duration(milliseconds: 400),
              curve: Curves.easeOutCubic,
              height: 6,
              width: isActive
                  ? MediaQuery.of(context).size.width * 0.35
                  : MediaQuery.of(context).size.width * 0.22,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                color: isActive
                    ? Theme.of(context).primaryColor
                    : isCompleted
                    ? Theme.of(context).primaryColor.withOpacity(0.5)
                    : (isDark
                          ? const Color(0xFF1E293B)
                          : const Color(0xFFE2E8F0)),
                boxShadow: isActive
                    ? [
                        BoxShadow(
                          color: Theme.of(
                            context,
                          ).primaryColor.withOpacity(0.25),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
            );
          }),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _buildStepperLabel(0, 'Welcome'),
            _buildStepperLabel(1, 'Permissions'),
          ],
        ),
      ],
    );
  }

  Widget _buildStepperLabel(int index, String text) {
    final isActive = _currentStep == index;
    final isCompleted = _currentStep > index;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Text(
      text,
      style: TextStyle(
        fontSize: 12,
        fontWeight: isActive ? FontWeight.bold : FontWeight.w600,
        color: isActive
            ? Theme.of(context).primaryColor
            : isCompleted
            ? (isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569))
            : (isDark ? const Color(0xFF475569) : const Color(0xFF94A3B8)),
      ),
    );
  }

  // --- STEP 1: WELCOME SCREEN ---
  Widget _buildWelcomePage(bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Spacer(flex: 3),
          // Large Custom Glowing Logo Container
          Stack(
            alignment: Alignment.center,
            children: [
              // Outer Halo Glow
              Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Theme.of(context).primaryColor.withOpacity(0.12),
                ),
              ),
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isDark ? const Color(0xFF151D30) : Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.25 : 0.08),
                      blurRadius: 25,
                      offset: const Offset(0, 10),
                    ),
                  ],
                  border: Border.all(
                    color: Theme.of(context).primaryColor.withOpacity(0.15),
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  Icons.auto_awesome_rounded,
                  size: 70,
                  color: Theme.of(context).primaryColor,
                ),
              ),
            ],
          ),
          const Spacer(flex: 2),
          // Clean Title
          Text(
            'Beatrice OS',
            style: TextStyle(
              fontSize: 38,
              fontWeight: FontWeight.w900,
              color: isDark ? Colors.white : const Color(0xFF1E293B),
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Your local, secure, and smart mobile companion. Beatrice OS can navigate apps, perform operations, and speak with you.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
              height: 1.55,
            ),
          ),
          const Spacer(flex: 2),

          // Custom Sleek Features list
          _buildFeatureCard(
            Icons.vpn_key_outlined,
            'Local & Private',
            'Full support for local-first execution. Keys remain encrypted locally.',
            isDark,
          ),
          const SizedBox(height: 12),
          _buildFeatureCard(
            Icons.ads_click_rounded,
            'Automated Actions',
            'Can read your screen and perform operations across other apps.',
            isDark,
          ),

          const Spacer(flex: 3),
          // Get Started button
          Container(
            width: double.infinity,
            height: 56,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              color: Theme.of(context).colorScheme.primary,
              boxShadow: [
                BoxShadow(
                  color: Theme.of(
                    context,
                  ).colorScheme.primary.withOpacity(0.25),
                  blurRadius: 15,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: ElevatedButton(
              onPressed: () {
                _pageController.nextPage(
                  duration: const Duration(milliseconds: 400),
                  curve: Curves.easeOutCubic,
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                foregroundColor: Colors.white,
                shadowColor: Colors.transparent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Get Started',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.2,
                    ),
                  ),
                  SizedBox(width: 10),
                  Icon(Icons.arrow_forward_rounded, size: 20),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildFeatureCard(
    IconData icon,
    String title,
    String subtitle,
    bool isDark,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.06),
          width: 1.2,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Theme.of(context).primaryColor.withOpacity(0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 22, color: Theme.of(context).primaryColor),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? const Color(0xFF94A3B8)
                        : const Color(0xFF475569),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- STEP 2: PERMISSIONS SCREEN ---
  Widget _buildPermissionsPage(bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          const Text(
            'Configure Permissions',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Permissions are needed to interact with other apps.',
            style: TextStyle(
              fontSize: 14,
              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView(
              physics: const BouncingScrollPhysics(),
              children: [
                _buildSectionHeader('MANDATORY', isDark),
                _buildPermissionCard(
                  'Screen Control (Accessibility)',
                  'Allows the AI to read your screen and automatically perform clicks, scrolls, and typing to execute tasks across other apps on your phone.',
                  Icons.visibility_rounded,
                  _isAccessibilityGranted,
                  _requestAccessibility,
                  isDark,
                ),
                const SizedBox(height: 12),
                _buildPermissionCard(
                  'Microphone',
                  'Required to listen to your voice commands and convert speech to text.',
                  Icons.mic_rounded,
                  _isMicrophoneGranted,
                  () => _requestPermission(Permission.microphone),
                  isDark,
                ),
                if (FeatureFlags.floatingOverlayEnabled) ...[
                  const SizedBox(height: 12),
                  _buildPermissionCard(
                    'Display Over Other Apps (Floating Bubble)',
                    'Allows Beatrice OS to show a floating overlay bubble when backgrounded or executing a task so you can monitor progress and execute actions.',
                    Icons.layers_rounded,
                    _isOverlayGranted,
                    _requestOverlayPermission,
                    isDark,
                  ),
                ],
                const SizedBox(height: 20),
                _buildSectionHeader('OPTIONAL', isDark),
                _buildPermissionCard(
                  'Notifications',
                  'Allows Beatrice OS to show ongoing tasks, alerts, and execution updates in your notification tray.',
                  Icons.notifications_rounded,
                  _isNotificationsGranted,
                  () => _requestPermission(Permission.notification),
                  isDark,
                ),
                const SizedBox(height: 12),
                _buildPermissionCard(
                  'Contacts',
                  'Used to look up phone numbers and contact names when you ask the AI to call or text someone.',
                  Icons.contacts_rounded,
                  _isContactsGranted,
                  () => _requestPermission(Permission.contacts),
                  isDark,
                ),
                const SizedBox(height: 12),
                _buildPermissionCard(
                  'Phone',
                  'Enables the AI to dial phone calls on your behalf when requested.',
                  Icons.phone_rounded,
                  _isPhoneGranted,
                  () => _requestPermission(Permission.phone),
                  isDark,
                ),
                const SizedBox(height: 12),
                _buildPermissionCard(
                  'SMS',
                  'Allows the AI to send and read text messages on your behalf when requested.',
                  Icons.sms_rounded,
                  _isSmsGranted,
                  () => _requestPermission(Permission.sms),
                  isDark,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),

          // Bottom Navigation Row
          Row(
            children: [
              TextButton(
                onPressed: () {
                  _pageController.previousPage(
                    duration: const Duration(milliseconds: 400),
                    curve: Curves.easeOutCubic,
                  );
                },
                style: TextButton.styleFrom(
                  foregroundColor: isDark
                      ? Colors.white
                      : const Color(0xFF475569),
                ),
                child: const Text(
                  'Back',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
              const Spacer(),
              Container(
                height: 48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: _canProceedToModel
                      ? Theme.of(context).colorScheme.primary
                      : (isDark
                            ? const Color(0xFF1E293B)
                            : const Color(0xFFE2E8F0)),
                  boxShadow: _canProceedToModel
                      ? [
                          BoxShadow(
                            color: Theme.of(
                              context,
                            ).colorScheme.primary.withOpacity(0.25),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ]
                      : null,
                ),
                child: ElevatedButton(
                  onPressed: _canProceedToModel ? _finishOnboarding : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    foregroundColor: Colors.white,
                    shadowColor: Colors.transparent,
                    disabledForegroundColor: isDark
                        ? const Color(0xFF475569)
                        : const Color(0xFF94A3B8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                  ),
                  child: const Row(
                    children: [
                      Text(
                        'Finish',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      SizedBox(width: 8),
                      Icon(Icons.rocket_launch_rounded, size: 16),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4, left: 4),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF475569),
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  Widget _buildPermissionCard(
    String title,
    String description,
    IconData icon,
    bool isGranted,
    VoidCallback onGrant,
    bool isDark,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: isGranted
              ? Colors.green.withOpacity(0.3)
              : Theme.of(context).colorScheme.onSurface.withOpacity(0.08),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.2 : 0.03),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Theme.of(context).primaryColor.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      icon,
                      size: 20,
                      color: Theme.of(context).primaryColor,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  if (isGranted)
                    const Icon(
                      Icons.check_circle_rounded,
                      color: Colors.green,
                      size: 24,
                    )
                  else
                    ElevatedButton(
                      onPressed: onGrant,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        minimumSize: const Size(60, 36),
                      ),
                      child: const Text(
                        'Grant',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                description,
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.45,
                  color: isDark
                      ? const Color(0xFF94A3B8)
                      : const Color(0xFF475569),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // --- STEP 3: MODEL SETUP SCREEN ---
  // Removed: the AI model configuration step is no longer part of onboarding.
  // Gemini is the default provider and the API key is loaded at runtime from
  // the bundled (gitignored) local config, so users go straight to the app.
}
