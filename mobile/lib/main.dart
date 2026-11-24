import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'app.dart';
import 'core/providers.dart';
import 'core/storage.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // The website shows Arabic text with Western digits (ar-u-nu-latn); match it.
  DateFormat.useNativeDigitsByDefaultFor('ar', false);

  LicenseRegistry.addLicense(() async* {
    for (final (font, file) in [('Manrope', 'Manrope'), ('Readex Pro', 'ReadexPro')]) {
      yield LicenseEntryWithLineBreaks([font], await rootBundle.loadString('assets/fonts/OFL-$file.txt'));
    }
  });

  unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(systemNavigationBarColor: Colors.transparent, systemNavigationBarContrastEnforced: false),
  );

  // One Keychain/Keystore read for everything saved, before the first frame:
  // a signed-in person lands on their home screen with no spinner.
  final store = Store();
  final boot = Boot(await store.readAll());

  runApp(
    ProviderScope(
      overrides: [bootProvider.overrideWithValue(boot), storeProvider.overrideWithValue(store)],
      // Screens offer their own "Try again"; never retry behind the person's back.
      retry: (retryCount, error) => null,
      child: const PmsApp(),
    ),
  );
}
