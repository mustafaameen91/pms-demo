import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';
import '../theme/theme.dart';
import '../widgets/brand.dart';
import '../widgets/common.dart';

/// Shown only when signed in on this phone but nothing is saved yet (rare):
/// the profile is loading, or couldn't be loaded because there's no connection.
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final failed = ref.watch(sessionProvider.select((s) => s.startFailed));
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: BlueprintBackdrop(
          child: SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(Space.xxl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const BrandMark(size: 72),
                    const SizedBox(height: Space.xxl),
                    if (!failed)
                      const SizedBox.square(dimension: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    else ...[
                      Text(
                        context.l10n.networkError,
                        textAlign: TextAlign.center,
                        style: context.text.bodyLarge!.copyWith(color: Colors.white),
                      ),
                      const SizedBox(height: Space.lg),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Brand.teal800,
                          minimumSize: const Size(200, 52),
                        ),
                        onPressed: () => ref.read(sessionProvider.notifier).refresh(),
                        icon: const Icon(Icons.refresh_rounded),
                        label: Text(context.l10n.tryAgain),
                      ),
                      const SizedBox(height: Space.sm),
                      TextButton(
                        style: TextButton.styleFrom(foregroundColor: Colors.white),
                        onPressed: () => ref.read(sessionProvider.notifier).signOut(),
                        child: Text(context.l10n.signOut),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
