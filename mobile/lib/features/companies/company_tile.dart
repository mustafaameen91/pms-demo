import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../../theme/icons.dart';

String roleLabel(BuildContext context, Role role) => switch (role) {
  Role.owner => context.l10n.roleOwner,
  Role.admin => context.l10n.roleAdmin,
  Role.member => context.l10n.roleMember,
};

/// A company in a list: initials, name, my role and which home it opens.
class CompanyTile extends StatelessWidget {
  const CompanyTile({super.key, required this.workspace, required this.onTap, this.selected = false});
  final Workspace workspace;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final p = context.palette;
    final w = workspace;
    return Material(
      color: selected ? context.colors.primaryContainer.withValues(alpha: 0.5) : p.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Radii.lg),
        side: BorderSide(color: selected ? context.colors.primary : p.border, width: selected ? 1.5 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Row(
            children: [
              Opacity(opacity: w.allowed ? 1 : 0.55, child: InitialsAvatar(name: w.name, size: 48)),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(w.name, style: context.text.titleMedium, maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(
                      '${roleLabel(context, w.role)} · ${w.view == HomeView.manager ? l.managerView : l.memberView}',
                      style: context.text.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: Space.sm),
              if (!w.allowed)
                _Pill(icon: AppIcons.lock, label: l.locked, fg: p.warning, bg: p.warningSoft)
              else if (w.unread > 0)
                _Pill(icon: AppIcons.bell, label: '${w.unread}', fg: p.info, bg: p.infoSoft, semantics: l.unreadCount(w.unread)),
              if (selected)
                Padding(
                  padding: const EdgeInsetsDirectional.only(start: Space.sm),
                  child: Icon(AppIcons.checkCircleFill, color: context.colors.primary),
                )
              else
                Icon(AppIcons.caretRight, color: p.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label, required this.fg, required this.bg, this.semantics});
  final IconData icon;
  final String label;
  final Color fg, bg;
  final String? semantics;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semantics,
      excludeSemantics: semantics != null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 4),
            Text(label, style: context.text.labelSmall!.copyWith(color: fg)),
          ],
        ),
      ),
    );
  }
}
