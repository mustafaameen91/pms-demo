import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/work.dart';
import '../../theme/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/ui.dart';

/// A project's photos (its file library's "Photos"), newest first; add from the camera or gallery.
class PhotosScreen extends ConsumerStatefulWidget {
  const PhotosScreen({super.key, required this.slug, this.projectId});
  final String slug;
  final String? projectId;

  @override
  ConsumerState<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends ConsumerState<PhotosScreen> {
  String? _project;
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    _project = widget.projectId;
  }

  Future<void> _add() async {
    final path = await pickPhoto(context);
    if (path == null || !mounted || _project == null) return;
    setState(() => _uploading = true);
    try {
      final r = await ref.read(workProvider).addPhotos(widget.slug, _project!, [path]);
      if (mounted) toastResult(context, r, context.l10n.photoAdded);
    } catch (e) {
      if (mounted) toastError(context, e);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final projects = ref.watch(projectsProvider(widget.slug));
    final list = projects.value;
    if (_project == null && list != null && list.isNotEmpty) _project = list.first.id;
    final key = _project == null ? null : (slug: widget.slug, id: _project!);
    final value = key == null ? null : ref.watch(photosProvider(key));

    return Scaffold(
      appBar: AppBar(title: Text(l.photos)),
      floatingActionButton: _project == null
          ? null
          : FloatingActionButton.extended(
              onPressed: _uploading ? null : _add,
              icon: _uploading
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.5))
                  : const Icon(Icons.add_a_photo_rounded),
              label: Text(_uploading ? l.uploading : l.addPhoto),
            ),
      body: list == null
          ? AsyncBody(value: projects, onRetry: () => ref.invalidate(projectsProvider(widget.slug)), builder: (_) => const SizedBox())
          : list.isEmpty
          ? EmptyState(icon: Icons.apartment_rounded, message: l.notOnProjects)
          : Column(
              children: [
                if (list.length > 1)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(Space.gutter, Space.sm, Space.gutter, Space.md),
                    child: ProjectField(projects: list, value: _project, onChanged: (v) => setState(() => _project = v)),
                  ),
                Expanded(
                  child: AsyncBody(
                    value: value!,
                    onRetry: () => ref.invalidate(photosProvider(key!)),
                    builder: (photos) => photos.isEmpty
                        ? SingleChildScrollView(child: EmptyState(icon: Icons.photo_camera_outlined, message: l.noPhotos))
                        : RefreshIndicator(
                            onRefresh: () => ref.refresh(photosProvider(key!).future).then((_) {}, onError: (Object _) {}),
                            child: LayoutBuilder(
                              builder: (context, c) {
                                const gap = 4.0;
                                final columns = c.maxWidth > 600 ? 5 : 3;
                                final cell = (c.maxWidth - Space.gutter * 2 - gap * (columns - 1)) / columns;
                                return GridView.builder(
                                  padding: const EdgeInsets.fromLTRB(Space.gutter, 0, Space.gutter, 96),
                                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: columns, mainAxisSpacing: gap, crossAxisSpacing: gap),
                                  itemCount: photos.length,
                                  itemBuilder: (context, i) {
                                    final photo = photos[i];
                                    final label = [photo.name, if (photo.taskKey != null) photo.taskKey!, if (photo.uploadedBy != null) photo.uploadedBy!, context.ago(photo.uploadedAt)].join(' · ');
                                    return Semantics(
                                      button: true,
                                      label: label,
                                      child: GestureDetector(
                                        onTap: () => PhotoViewer.open(context, photo.url, title: label),
                                        child: ClipRRect(borderRadius: BorderRadius.circular(Radii.sm), child: AuthImage(photo.url, size: cell)),
                                      ),
                                    );
                                  },
                                );
                              },
                            ),
                          ),
                  ),
                ),
              ],
            ),
    );
  }
}
