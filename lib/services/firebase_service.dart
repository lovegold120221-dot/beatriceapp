import 'dart:developer' as developer;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Initializes Firebase and manages device pairing for the Beatrice OS
/// task queue bridge.
///
/// The pairing flow:
/// 1. Phone calls [ensurePaired] on first launch → generates a deviceId +
///    pairing code, saves both to SharedPreferences + Firebase.
/// 2. User enters the pairing code in the web app (beatrice.eburon.ai).
/// 3. Web app links the code to their Firebase auth UID via [linkDeviceToUser].
/// 4. From then on, the web app creates tasks → phone claims & executes them.
class FirebaseService {
  static final FirebaseService _instance = FirebaseService._();
  factory FirebaseService() => _instance;
  FirebaseService._();

  bool _initialized = false;
  late FirebaseDatabase _db;

  String? _deviceId;
  String? _pairingCode;
  String? _ownerId;

  String? get deviceId => _deviceId;
  String? get pairingCode => _pairingCode;
  String? get ownerId => _ownerId;
  FirebaseDatabase get database => _db;
  bool get isInitialized => _initialized;

  /// Initialize Firebase Core + Realtime Database. Safe to call multiple times.
  Future<void> init() async {
    if (_initialized) return;
    try {
      await Firebase.initializeApp();
      _db = FirebaseDatabase.instance;
      _db.databaseURL = _databaseUrl;
      _initialized = true;
      developer.log('FirebaseService initialized', name: 'BeatriceOS');
    } catch (e) {
      developer.log('FirebaseService init failed: $e', name: 'BeatriceOS');
      rethrow;
    }
  }

  /// Firebase RTDB URL for the beatrice-os project.
  static const String _databaseUrl =
      'https://beatrice-os-default-rtdb.europe-west1.firebasedatabase.app';

  /// Ensure this device is paired. On first run, generates a deviceId + code
  /// and saves them. On subsequent runs, loads them from SharedPreferences.
  /// Returns the pairing code (shown to the user to enter in the web app).
  Future<String> ensurePaired() async {
    if (!_initialized) await init();

    final prefs = await SharedPreferences.getInstance();

    // Try loading existing deviceId + code.
    _deviceId = prefs.getString('firebase_device_id');
    _pairingCode = prefs.getString('firebase_pairing_code');

    if (_deviceId == null || _pairingCode == null) {
      // First run — generate new credentials.
      _deviceId = 'dev_${DateTime.now().millisecondsSinceEpoch}_${_randomString(6)}';
      _pairingCode = _randomString(6).toUpperCase();

      await prefs.setString('firebase_device_id', _deviceId!);
      await prefs.setString('firebase_pairing_code', _pairingCode!);

      // Write the device record to Firebase.
      await _db.ref('devices/$_deviceId').set({
        'deviceId': _deviceId,
        'pairingCode': _pairingCode,
        'ownerId': null,
        'name': 'Beatrice OS Phone',
        'pairedAt': ServerValue.timestamp,
      });

      developer.log(
        'Device paired: id=$_deviceId, code=$_pairingCode',
        name: 'BeatriceOS',
      );
    }

    // Check if an owner has been linked (web user entered the code).
    final snapshot = await _db.ref('devices/$_deviceId/ownerId').get();
    if (snapshot.exists && snapshot.value != null) {
      _ownerId = snapshot.value.toString();
      await prefs.setString('firebase_owner_id', _ownerId!);
    } else {
      // Try loading from prefs as fallback.
      _ownerId = prefs.getString('firebase_owner_id');
    }

    return _pairingCode!;
  }

  /// Check if this device has been linked to a web user.
  Future<bool> isLinked() async {
    if (_ownerId != null) return true;
    if (!_initialized) await init();
    if (_deviceId == null) await ensurePaired();

    final snapshot = await _db.ref('devices/$_deviceId/ownerId').get();
    if (snapshot.exists && snapshot.value != null) {
      _ownerId = snapshot.value.toString();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('firebase_owner_id', _ownerId!);
      return true;
    }
    return false;
  }

  /// Refresh the owner link status (call periodically or after user enters code).
  Future<void> refreshOwnerLink() async {
    if (_deviceId == null) return;
    final snapshot = await _db.ref('devices/$_deviceId/ownerId').get();
    if (snapshot.exists && snapshot.value != null) {
      _ownerId = snapshot.value.toString();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('firebase_owner_id', _ownerId!);
    }
  }

  String _randomString(int length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final now = DateTime.now().millisecondsSinceEpoch;
    final buffer = StringBuffer();
    for (int i = 0; i < length; i++) {
      buffer.write(chars[(now + i * 7) % chars.length]);
    }
    return buffer.toString();
  }
}