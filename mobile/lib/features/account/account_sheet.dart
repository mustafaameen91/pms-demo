import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../companies/company_tile.dart';
import '../../theme/icons.dart';

Future<void> showAccountSheet(BuildContext context) => showModalBottomSheet<void>(
  useRootNavigator: true,
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => const _AccountSheet(),
);

/// Pick another company without leaving home.
Future<void> showCompanySwitcher(BuildContext context, String currentSlug) => showModalBottomSheet<void>(
  useRootNavigator: true,
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => _CompanySheet(currentSlug: currentSlug),
);

class _AccountSheet extends ConsumerWidget {
  const _AccountSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final p = context.palette;
    final me = ref.watch(sessionProvider.select((s) => s.me));
    final language = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);
    final slug = ref.watch(currentSlugProvider);
    if (me == null) return const SizedBox.shrink();

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, MediaQuery.paddingOf(context).bottom + Space.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              InitialsAvatar(name: me.user.name, size: 52),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(me.user.name, style: context.text.titleMedium),
                    Text(me.user.email, style: context.text.bodySmall, textDirection: TextDirection.ltr),
                  ],
                ),
              ),
            ],
          ),
          if (me.workspaces.length > 1) ...[
            const SizedBox(height: Space.lg),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: () {
                // The sheet's own context goes away when it closes.
                final navigator = Navigator.of(context);
                final router = GoRouter.of(context);
                navigator.pop();
                if (slug != null) {
                  showCompanySwitcher(navigator.context, slug);
                } else {
                  router.go('/companies');
                }
              },
              icon: const Icon(AppIcons.arrowsLeftRight),
              label: Text(l.switchCompany),
            ),
          ],
          const SizedBox(height: Space.xxl),
          Text(l.language, style: context.text.titleSmall),
          const SizedBox(height: Space.sm),
          SegmentedButton<String?>(
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: null, label: Text(l.phoneLanguage), icon: const Icon(AppIcons.deviceMobile, size: 18)),
              const ButtonSegment(value: 'en', label: Text('English')),
              const ButtonSegment(value: 'ar', label: Text('العربية')),
            ],
            selected: {language},
            onSelectionChanged: (s) {
              HapticFeedback.selectionClick();
              ref.read(languageProvider.notifier).set(s.first);
            },
          ),
          const SizedBox(height: Space.xl),
          Text(l.appearance, style: context.text.titleSmall),
          const SizedBox(height: Space.sm),
          SegmentedButton<ThemeMode>(
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: ThemeMode.system, label: Text(l.phoneSetting), icon: const Icon(AppIcons.circleHalf, size: 18)),
              ButtonSegment(value: ThemeMode.light, label: Text(l.light), icon: const Icon(AppIcons.sun, size: 18)),
              ButtonSegment(value: ThemeMode.dark, label: Text(l.dark), icon: const Icon(AppIcons.moon, size: 18)),
            ],
            selected: {themeMode},
            onSelectionChanged: (s) {
              HapticFeedback.selectionClick();
              ref.read(themeModeProvider.notifier).set(s.first);
            },
          ),
          const SizedBox(height: Space.xxl),
          const Divider(),
          const SizedBox(height: Space.sm),
          // Kept apart from the settings above, in the danger colour.
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: p.danger, minimumSize: const Size.fromHeight(52)),
            onPressed: () {
              Navigator.pop(context);
              ref.read(sessionProvider.notifier).signOut();
            },
            icon: const Icon(AppIcons.signOut),
            label: Text(l.signOut),
          ),
        ],
      ),
    );
  }
}

class _CompanySheet extends ConsumerWidget {
  const _CompanySheet({required this.currentSlug});
  final String currentSlug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workspaces = ref.watch(sessionProvider.select((s) => s.me?.workspaces ?? const []));
    return ListView.separated(
      shrinkWrap: true,
      padding: EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, MediaQuery.paddingOf(context).bottom + Space.lg),
      itemCount: workspaces.length + 1,
      separatorBuilder: (context, i) => SizedBox(height: i == 0 ? Space.lg : Space.md),
      itemBuilder: (context, i) {
        if (i == 0) {
          return Semantics(header: true, child: Text(context.l10n.switchCompany, style: context.text.titleLarge));
        }
        final w = workspaces[i - 1];
        return CompanyTile(
          workspace: w,
          selected: w.slug == currentSlug,
          onTap: () {
            final router = GoRouter.of(context);
            Navigator.pop(context);
            if (w.slug == currentSlug) return;
            HapticFeedback.selectionClick();
            ref.read(currentSlugProvider.notifier).open(w.slug);
            router.go('/w/${w.slug}');
          },
        );
      },
    );
  }
}
