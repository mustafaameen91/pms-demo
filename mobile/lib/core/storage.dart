import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Everything the app keeps on the phone, in the Keychain (iOS) / Keystore (Android).
///
/// It is read once, in one call, before the first frame ([Boot]); after that the
/// app works from memory and only writes here, so storage never slows a screen down.
class Store {
  Store([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  final FlutterSecureStorage _storage;

  static const token = 'token';
  static const me = 'me';
  static const lastSlug = 'lastSlug';
  static const locale = 'locale';
  static const theme = 'theme';
  static const homePrefix = 'home:';

  Future<Map<String, String>> readAll() async {
    try {
      return await _storage.readAll();
    } catch (_) {
      // A Keychain/Keystore that can't be read (e.g. restored onto a new phone)
      // simply means a fresh start.
      return const {};
    }
  }

  Future<void> write(String key, String? value) async {
    try {
      if (value == null) {
        await _storage.delete(key: key);
      } else {
        await _storage.write(key: key, value: value);
      }
    } catch (_) {
      // Saving is best effort: the app keeps working from memory.
    }
  }

  /// Forget the account (token, profile, saved screens) but keep language and appearance.
  Future<void> clearAccount(Iterable<String> keys) async {
    await Future.wait([
      for (final k in keys)
        if (k != locale && k != theme) write(k, null),
    ]);
  }
}

/// What was on the phone at launch.
class Boot {
  const Boot(this.values);
  final Map<String, String> values;
}
