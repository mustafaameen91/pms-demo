import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'l10n/gen/app_localizations.dart';
import 'router.dart';
import 'theme/theme.dart';

class PmsApp extends ConsumerWidget {
  const PmsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final chosen = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);
    final arabic = resolveLanguage(chosen) == 'ar';

    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      locale: chosen == null ? null : Locale(chosen),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      themeMode: themeMode,
      theme: buildTheme(Brightness.light, arabic: arabic),
      darkTheme: buildTheme(Brightness.dark, arabic: arabic),
      // Large text is welcome; past 1.6× the cards stop fitting on a phone.
      builder: (context, child) => MediaQuery.withClampedTextScaling(maxScaleFactor: 1.6, child: child!),
    );
  }
}
