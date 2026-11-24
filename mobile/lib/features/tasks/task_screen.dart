import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/work.dart';
import '../../core/work_models.dart';
import '../../theme/theme.dart';
import '../../widgets/brand.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';
import '../../theme/icons.dart';
import '../../widgets/page.dart';

String priorityLabel(BuildContext context, String p) => switch (p) {
  'low' => context.l10n.priorityLow,
  'medium' => context.l10n.priorityMedium,
  'high' => context.l10n.priorityHigh,
  'urgent' => context.l10n.priorityUrgent,
  _ => context.l10n.priorityNone,
};

/// One task: move it, update its progress, add photos and comments. What's
/// offered follows what the server says this person may do.
class TaskScreen extends ConsumerStatefulWidget {
  const TaskScreen({super.key, required this.slug, required this.id});
  final String slug;

  /// The task's id, or its key ("CLIN-3") when opened from a notification.
  final String id;

  @override
  ConsumerState<TaskScreen> createState() => _TaskScreenState();
}

class _TaskScreenState extends ConsumerState<TaskScreen> {
  SlugId get _key => (slug: widget.slug, id: widget.id);

  /// Shown at once while the server confirms (put back if it refuses).
  String? _pendingStatus;
  double? _progress;
  bool _savingProgress = false;
  bool _uploading = false;

  Future<void> _setStatus(TaskDetail t, StatusRef s) async {
    if (s.id == (_pendingStatus ?? t.statusId)) return;
    unawaited(HapticFeedback.selectionClick());
    setState(() => _pendingStatus = s.id);
    try {
      final r = await ref.read(workProvider).updateTask(widget.slug, t.id, statusId: s.id);
      if (mounted) toastResult(context, r, context.l10n.saved);
    } catch (e) {
      if (mounted) toastError(context, e);
    } finally {
      if (mounted) setState(() => _pendingStatus = null);
    }
  }

  Future<void> _saveProgress(TaskDetail t) async {
    final value = _progress?.round();
    if (value == null || value == t.progress) return;
    setState(() => _savingProgress = true);
    try {
      final r = await ref.read(workProvider).updateTask(widget.slug, t.id, progress: value);
      if (mounted) {
        toastResult(context, r, context.l10n.saved);
        setState(() => _progress = null);
      }
    } catch (e) {
      if (mounted) toastError(context, e);
    } finally {
      if (mounted) setState(() => _savingProgress = false);
    }
  }

  Future<void> _addPhoto(TaskDetail t) async {
    final path = await pickPhoto(context);
    if (path == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      final r = await ref.read(workProvider).addPhotos(widget.slug, t.project.id, [path], taskId: t.id);
      if (mounted) toastResult(context, r, context.l10n.photoAdded);
    } catch (e) {
      if (mounted) toastError(context, e);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(taskProvider(_key));
    final t = value.value;
    return Scaffold(
      appBar: BrandAppBar(
        title: Text(t?.key ?? '', style: context.text.titleMedium!.copyWith(color: Colors.white)),
        bottom: value.isLoading && t != null
            ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
            : null,
      ),
      body: t == null
          ? AsyncBody(value: value, onRetry: () => ref.invalidate(taskProvider(_key)), builder: (_) => const SizedBox())
          : Column(
              children: [
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () => ref.refresh(taskProvider(_key).future).then((_) {}, onError: (Object _) {}),
                    child: _body(context, t),
                  ),
                ),
                _Composer(slug: widget.slug, taskId: t.id),
              ],
            ),
    );
  }

  Widget _body(BuildContext context, TaskDetail t) {
    final l = context.l10n;
    final p = context.palette;
    final statusId = _pendingStatus ?? t.statusId;
    final progress = _progress ?? t.progress.toDouble();
    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.xxl),
      children: [
        Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: Color(parseHex(t.project.color) ?? Brand.graphite.toARGB32()), borderRadius: BorderRadius.circular(3)),
            ),
            const SizedBox(width: Space.sm),
            Expanded(child: Text(t.project.name, style: context.text.labelLarge!.copyWith(color: p.muted))),
            if (t.isMilestone) _Tag(icon: AppIcons.flagFill, label: l.milestone, tone: Tone.warning),
          ],
        ),
        const SizedBox(height: Space.sm),
        Text(t.title, textDirection: textDirOf(t.title), style: context.text.headlineSmall),
        if (t.parent != null) ...[
          const SizedBox(height: Space.xs),
          Text('${l.partOf} ${t.parent!.key} · ${t.parent!.title}', style: context.text.bodySmall),
        ],
        if (t.blockedBy.isNotEmpty) ...[
          const SizedBox(height: Space.lg),
          InlineBanner(
            icon: AppIcons.link,
            tone: Tone.warning,
            message: '${l.waitingOn}: ${t.blockedBy.map((b) => '${b.key} ${b.title}').join(' · ')}',
          ),
        ],
        if (t.readOnly) ...[
          const SizedBox(height: Space.lg),
          InlineBanner(icon: AppIcons.eye, tone: Tone.info, message: l.readOnlyTask),
        ],

        FieldLabel(l.status),
        if (t.canStatus)
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: [
              for (final s in t.statuses)
                ChoiceChip(
                  avatar: Container(width: 10, height: 10, decoration: BoxDecoration(color: Color(parseHex(s.color) ?? p.neutral.toARGB32()), shape: BoxShape.circle)),
                  label: Text(s.name),
                  selected: s.id == statusId,
                  showCheckmark: false,
                  onSelected: _pendingStatus != null ? null : (_) => _setStatus(t, s),
                ),
            ],
          )
        else if (t.status != null)
          Align(alignment: AlignmentDirectional.centerStart, child: StatusPill(status: t.status!)),

        FieldLabel(l.progress),
        AppCard(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, Space.md),
          child: Column(
            children: [
              Row(
                children: [
                  Text('${progress.round()}%', style: context.text.headlineSmall!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                  const SizedBox(width: Space.md),
                  const Spacer(),
                  if (t.canProgress && _progress != null && _progress!.round() != t.progress)
                    Flexible(
                      flex: 4,
                      child: FilledButton(
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                        onPressed: _savingProgress ? null : () => _saveProgress(t),
                        child: _savingProgress
                            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(l.saveProgress, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                ],
              ),
              if (t.canProgress)
                Slider(
                  value: progress,
                  max: 100,
                  divisions: 20,
                  label: '${progress.round()}%',
                  onChanged: (v) => setState(() => _progress = v),
                  onChangeEnd: (_) => HapticFeedback.selectionClick(),
                )
              else
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Space.sm),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(value: t.progress / 100, minHeight: 8, backgroundColor: p.neutralSoft),
                  ),
                ),
            ],
          ),
        ),

        const SizedBox(height: Space.lg),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.xs),
          child: Column(
            children: [
              _Detail(icon: AppIcons.calendarCheck, label: l.startLabel, value: t.startDate == null ? '—' : context.day(t.startDate!)),
              const Divider(),
              _Detail(icon: AppIcons.calendarBlank, label: l.dueLabel, value: t.dueDate == null ? '—' : context.day(t.dueDate!)),
              const Divider(),
              _Detail(icon: AppIcons.flag, label: l.priority, value: priorityLabel(context, t.priority)),
              const Divider(),
              _Detail(icon: AppIcons.user, label: l.assignee, value: t.assignee?.name ?? l.unassigned),
            ],
          ),
        ),

        if (t.description != null) ...[
          FieldLabel(l.description),
          AppCard(child: SelectableText(t.description!, textDirection: textDirOf(t.description!), style: context.text.bodyLarge)),
        ],

        if (t.subtasks.isNotEmpty) ...[
          FieldLabel(l.subtasks),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
            child: Column(
              children: [
                for (final (i, s) in t.subtasks.indexed) ...[
                  if (i > 0) const Divider(indent: 36),
                  ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 48),
                    child: Row(
                      children: [
                        Icon(s.done ? AppIcons.checkCircleFill : AppIcons.circle, size: 22, color: s.done ? p.success : p.muted),
                        const SizedBox(width: Space.md),
                        Expanded(
                          child: Text(
                            s.title,
                            textDirection: textDirOf(s.title),
                            style: context.text.bodyLarge!.copyWith(
                              decoration: s.done ? TextDecoration.lineThrough : null,
                              color: s.done ? p.muted : null,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],

        FieldLabel(l.photos),
        SizedBox(
          height: 104,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _AddPhotoTile(busy: _uploading, onTap: () => _addPhoto(t)),
              for (final photo in t.photos)
                Padding(
                  padding: const EdgeInsetsDirectional.only(start: Space.sm),
                  child: Semantics(
                    button: true,
                    label: photo.name,
                    child: GestureDetector(
                      onTap: () => PhotoViewer.open(context, photo.url, title: photo.name),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(Radii.md),
                        child: SizedBox.square(dimension: 104, child: AuthImage(photo.url, size: 104)),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),

        FieldLabel(l.comments),
        if (t.comments.isEmpty)
          Text(l.noComments, style: context.text.bodyMedium!.copyWith(color: p.muted))
        else
          for (final c in t.comments) _CommentBubble(comment: c),
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.icon, required this.label, required this.tone});
  final IconData icon;
  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: tone.bg(p), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [Icon(icon, size: 14, color: tone.fg(p)), const SizedBox(width: 4), Text(label, style: context.text.labelSmall!.copyWith(color: tone.fg(p)))],
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return MergeSemantics(
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 50),
        child: Row(
          children: [
            Icon(icon, size: 20, color: p.muted),
            const SizedBox(width: Space.md),
            Text(label, style: context.text.bodyMedium!.copyWith(color: p.muted)),
            const SizedBox(width: Space.md),
            Expanded(child: Text(value, textAlign: TextAlign.end, style: context.text.bodyLarge!.copyWith(fontWeight: FontWeight.w500))),
          ],
        ),
      ),
    );
  }
}

class _AddPhotoTile extends StatelessWidget {
  const _AddPhotoTile({required this.busy, required this.onTap});
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: p.infoSoft,
      borderRadius: BorderRadius.circular(Radii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.md),
        onTap: busy ? null : onTap,
        child: SizedBox.square(
          dimension: 104,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (busy)
                const SizedBox.square(dimension: 26, child: CircularProgressIndicator(strokeWidth: 2.5))
              else
                Icon(AppIcons.cameraPlus, color: p.info, size: 28),
              const SizedBox(height: Space.sm),
              Text(busy ? context.l10n.uploading : context.l10n.addPhoto, textAlign: TextAlign.center, style: context.text.labelMedium!.copyWith(color: p.info)),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommentBubble extends StatelessWidget {
  const _CommentBubble({required this.comment});
  final Comment comment;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final c = comment;
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InitialsAvatar(name: c.author?.name ?? '?', size: 36),
          const SizedBox(width: Space.md),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(Space.md),
              decoration: BoxDecoration(
                color: c.mine ? context.colors.primaryContainer.withValues(alpha: 0.55) : p.card,
                border: Border.all(color: c.mine ? Colors.transparent : p.border),
                borderRadius: const BorderRadiusDirectional.only(
                  topEnd: Radius.circular(Radii.md),
                  bottomStart: Radius.circular(Radii.md),
                  bottomEnd: Radius.circular(Radii.md),
                  topStart: Radius.circular(4),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(c.author?.name ?? '—', style: context.text.labelLarge)),
                      Text(context.ago(c.createdAt), style: context.text.labelSmall!.copyWith(color: p.muted)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  SelectableText(c.body, textDirection: textDirOf(c.body), style: context.text.bodyMedium),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The comment box, kept above the keyboard.
class _Composer extends ConsumerStatefulWidget {
  const _Composer({required this.slug, required this.taskId});
  final String slug;
  final String taskId;

  @override
  ConsumerState<_Composer> createState() => _ComposerState();
}

class _ComposerState extends ConsumerState<_Composer> {
  final _text = TextEditingController();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(workProvider).comment(widget.slug, widget.taskId, body);
      _text.clear();
      unawaited(HapticFeedback.lightImpact());
    } catch (e) {
      if (mounted) toastError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final canSend = _text.text.trim().isNotEmpty && !_sending;
    return DecoratedBox(
      decoration: BoxDecoration(color: p.card, border: Border(top: BorderSide(color: p.border))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.sm, Space.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _text,
                  minLines: 1,
                  maxLines: 5,
                  keyboardType: TextInputType.multiline,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: context.l10n.writeComment,
                    contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: Space.xs),
              IconButton.filled(
                tooltip: context.l10n.send,
                onPressed: canSend ? _send : null,
                iconSize: 22,
                style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                icon: _sending
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(AppIcons.paperPlaneRight),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
