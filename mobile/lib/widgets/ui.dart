import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/providers.dart';
import '../core/work_models.dart';
import '../theme/theme.dart';
import 'common.dart';
import 'motion.dart';
import '../theme/icons.dart';

/// Loading → a skeleton; failed with nothing to show → message + "Try again";
/// otherwise the data (a refresh that fails keeps what's on screen).
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.builder, required this.onRetry, this.skeleton});
  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final VoidCallback onRetry;
  final Widget? skeleton;

  @override
  Widget build(BuildContext context) {
    final data = value.value;
    if (data != null) return builder(data);
    if (value.hasError) {
      return Center(
        child: SingleChildScrollView(
          child: ErrorPanel(
            icon: AppIcons.cloudSlash,
            title: errorText(context, value.error!),
            actions: [
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(180, 52)),
                onPressed: onRetry,
                icon: const Icon(AppIcons.arrowClockwise),
                label: Text(context.l10n.tryAgain),
              ),
            ],
          ),
        ),
      );
    }
    return skeleton ?? const ListSkeleton();
  }
}

class ListSkeleton extends StatelessWidget {
  const ListSkeleton({super.key, this.rows = 6});
  final int rows;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Space.gutter),
        itemCount: rows,
        separatorBuilder: (_, _) => const SizedBox(height: Space.md),
        itemBuilder: (_, _) => const SkeletonBox(height: 76, radius: Radii.lg),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.message, this.action});
  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.xxl, vertical: 56),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // A soft brand glow behind a tinted tile, like the website's empty states.
          Container(
            width: 112,
            height: 112,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [p.info.withValues(alpha: 0.16), p.info.withValues(alpha: 0)]),
            ),
            child: Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: p.infoSoft,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: p.info.withValues(alpha: 0.12), width: 6),
              ),
              child: Icon(icon, size: 30, color: p.info),
            ),
          ),
          const SizedBox(height: Space.lg),
          Text(message, textAlign: TextAlign.center, style: context.text.bodyLarge!.copyWith(color: p.muted)),
          if (action != null) ...[const SizedBox(height: Space.xl), action!],
        ],
      ),
    );
  }
}

/// A short message at the bottom. [warning] for "saved, but…".
void toast(BuildContext context, String message, {bool warning = false, bool error = false}) {
  final p = context.palette;
  final m = ScaffoldMessenger.of(context);
  m.hideCurrentSnackBar();
  m.showSnackBar(
    SnackBar(
      backgroundColor: error ? p.danger : (warning ? p.warning : null),
      duration: Duration(seconds: warning || error ? 5 : 3),
      content: Row(
        children: [
          Icon(error ? AppIcons.warningCircle : (warning ? AppIcons.info : AppIcons.checkCircleFill), color: Colors.white, size: 20),
          const SizedBox(width: Space.sm),
          Expanded(child: Text(message)),
        ],
      ),
    ),
  );
}

/// After a change: the server's warning/info if any, else [done].
void toastResult(BuildContext context, ApiResult r, String done) {
  HapticFeedback.lightImpact();
  if (r.warning != null) return toast(context, r.warning!, warning: true);
  toast(context, r.info ?? done);
}

void toastError(BuildContext context, Object e) {
  HapticFeedback.mediumImpact();
  toast(context, errorText(context, e), error: true);
}

/// A task status: coloured dot + name (colour is never the only signal).
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.status, this.dense = false});
  final StatusRef status;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final c = Color(parseHex(status.color) ?? p.neutral.toARGB32());
    return Container(
      padding: EdgeInsets.symmetric(horizontal: dense ? 8 : 10, vertical: dense ? 3 : 5),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              status.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: (dense ? context.text.labelSmall : context.text.labelMedium)!.copyWith(color: context.colors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}

class ApprovalPill extends StatelessWidget {
  const ApprovalPill(this.status, {super.key});
  final Approval status;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final (tone, icon, label) = switch (status) {
      Approval.pending => (Tone.warning, AppIcons.hourglassHigh, l.statusPending),
      Approval.approved => (Tone.success, AppIcons.check, l.statusApproved),
      Approval.rejected => (Tone.danger, AppIcons.x, l.statusRejected),
    };
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: tone.bg(p), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: tone.fg(p)),
          const SizedBox(width: 4),
          Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.labelSmall!.copyWith(color: tone.fg(p)))),
        ],
      ),
    );
  }
}

/// A server file (photo, receipt) loaded with the sign-in token; decoded at the
/// size it's shown, so a grid of photos stays light on memory.
class AuthImage extends ConsumerWidget {
  const AuthImage(this.url, {super.key, this.size, this.fit = BoxFit.cover});
  final String url;

  /// Logical size it's drawn at (to decode smaller); null = full size.
  final double? size;
  final BoxFit fit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiProvider);
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final p = context.palette;
    return Image.network(
      api.fileUrl(url),
      headers: api.authHeaders,
      fit: fit,
      cacheWidth: size == null ? null : (size! * dpr).round(),
      gaplessPlayback: true,
      frameBuilder: (context, child, frame, sync) => sync
          ? child
          : AnimatedOpacity(opacity: frame == null ? 0 : 1, duration: Motion.medium, child: child),
      loadingBuilder: (context, child, progress) => progress == null ? child : ColoredBox(color: p.neutralSoft, child: child),
      errorBuilder: (context, _, _) => ColoredBox(
        color: p.neutralSoft,
        child: Center(child: Icon(AppIcons.imageBroken, color: p.muted)),
      ),
    );
  }
}

/// Full-screen photo with pinch-to-zoom.
class PhotoViewer extends StatelessWidget {
  const PhotoViewer({super.key, required this.url, this.title});
  final String url;
  final String? title;

  static Future<void> open(BuildContext context, String url, {String? title}) =>
      Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (_) => PhotoViewer(url: url, title: title)));

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: title == null ? null : Text(title!, style: context.text.titleMedium!.copyWith(color: Colors.white)),
          systemOverlayStyle: SystemUiOverlayStyle.light,
        ),
        body: InteractiveViewer(maxScale: 5, child: Center(child: AuthImage(url, fit: BoxFit.contain))),
      ),
    );
  }
}

/// Camera or gallery → a path to a photo already shrunk on the phone
/// (≤ 2048 px, JPEG 82%), so uploads are quick on site networks.
Future<String?> pickPhoto(BuildContext context) async {
  final l = context.l10n;
  final source = await showModalBottomSheet<ImageSource>(
    useRootNavigator: true,
    context: context,
    useSafeArea: true,
    builder: (context) => Padding(
      padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, Space.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            minTileHeight: 56,
            leading: const ToneIcon(AppIcons.camera, tone: Tone.info),
            title: Text(l.takePhoto),
            onTap: () => Navigator.pop(context, ImageSource.camera),
          ),
          ListTile(
            minTileHeight: 56,
            leading: const ToneIcon(AppIcons.images, tone: Tone.info),
            title: Text(l.chooseFromGallery),
            onTap: () => Navigator.pop(context, ImageSource.gallery),
          ),
        ],
      ),
    ),
  );
  if (source == null) return null;
  final file = await ImagePicker().pickImage(source: source, maxWidth: 2048, maxHeight: 2048, imageQuality: 82);
  return file?.path;
}

/// A labelled dropdown of my projects.
class ProjectField extends StatelessWidget {
  const ProjectField({super.key, required this.projects, required this.value, required this.onChanged, this.error});
  final List<ProjectRef> projects;
  final String? value;
  final ValueChanged<String?> onChanged;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: context.l10n.project, prefixIcon: const Icon(AppIcons.buildings), errorText: error),
      items: [for (final p in projects) DropdownMenuItem(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis))],
      onChanged: onChanged,
    );
  }
}

/// A section label inside a form or detail page.
class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(start: Space.xs, bottom: Space.sm, top: Space.lg),
    child: Text(text, style: context.text.titleSmall!.copyWith(color: context.palette.muted)),
  );
}

/// A form's main button, pinned to the bottom of the screen (and above the keyboard).
class StickyAction extends StatelessWidget {
  const StickyAction({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DecoratedBox(
        decoration: BoxDecoration(color: context.colors.surface, border: Border(top: BorderSide(color: p.border))),
        child: SafeArea(
          top: false,
          child: Padding(padding: const EdgeInsets.fromLTRB(Space.gutter, Space.md, Space.gutter, Space.md), child: child),
        ),
      ),
    );
  }
}
