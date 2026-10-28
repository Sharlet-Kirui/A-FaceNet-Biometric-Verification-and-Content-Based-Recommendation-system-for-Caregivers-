import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../core/app_theme.dart';

class PickedDocument {
  final String name;
  final String path;
  final int size;

  const PickedDocument({
    required this.name,
    required this.path,
    required this.size,
  });

  bool get isImage {
    final n = name.toLowerCase();
    return n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png');
  }
}

/// Dashed upload target that becomes a file card once a file is chosen.
/// Accepts JPG, PNG or PDF up to [maxBytes].
class DocumentUploadSlot extends StatelessWidget {
  static const maxBytes = 5 * 1024 * 1024;

  final String label;
  final bool required;
  final bool optional;
  final bool large;
  final String emptyText;
  final PickedDocument? value;
  final ValueChanged<PickedDocument?> onChanged;
  final String? errorText;

  const DocumentUploadSlot({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.required = false,
    this.optional = false,
    this.large = false,
    this.emptyText = 'Add Document',
    this.errorText,
  });

  Future<void> _pick(BuildContext context) async {
  final result = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: const ['jpg', 'jpeg', 'png', 'pdf'],
  );
  if (result == null || result.isEmpty) return;
  final file = result.first;
  final path = file.path;
  if (path == null) return;
  final bytes = await File(path).length();
  if (!context.mounted) return;
  if (bytes > maxBytes) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('File is too large. Maximum size is 5 MB.')),
    );
    return;
  }
  onChanged(PickedDocument(
    name: path.split(RegExp(r'[\\/]')).last,
    path: path,
    size: bytes,
  ));
}

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: label,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textDark,
            ),
            children: [
              if (required)
                const TextSpan(
                  text: ' *',
                  style: TextStyle(color: AppColors.error),
                ),
              if (optional)
                const TextSpan(
                  text: ' (Optional)',
                  style: TextStyle(
                      fontWeight: FontWeight.w400, color: AppColors.textMuted),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        value == null ? _empty(context) : _filled(context, value!),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              errorText!,
              style: const TextStyle(fontSize: 13, color: AppColors.error),
            ),
          ),
      ],
    );
  }

  Widget _empty(BuildContext context) {
    return InkWell(
      onTap: () => _pick(context),
      borderRadius: BorderRadius.circular(14),
      child: CustomPaint(
        painter: _DashedBorderPainter(
          color: errorText != null ? AppColors.error : AppColors.border,
        ),
        child: Container(
          width: double.infinity,
          padding: EdgeInsets.symmetric(vertical: large ? 36 : 20),
          alignment: Alignment.center,
          child: large
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: const BoxDecoration(
                        color: AppColors.stepInactive,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.upload_file,
                          color: AppColors.primaryDark, size: 28),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      emptyText,
                      style: const TextStyle(
                          fontSize: 16, color: AppColors.textMuted),
                    ),
                  ],
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.add_circle_outline,
                        color: AppColors.textDark, size: 26),
                    const SizedBox(width: 10),
                    Text(
                      emptyText,
                      style: const TextStyle(
                          fontSize: 16, color: AppColors.textMuted),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _filled(BuildContext context, PickedDocument doc) {
    final kb = (doc.size / 1024).round();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 64,
              height: 64,
              child: doc.isImage
                  ? Image.file(File(doc.path), fit: BoxFit.cover)
                  : Container(
                      color: AppColors.stepInactive,
                      child: const Icon(Icons.picture_as_pdf,
                          color: AppColors.primaryDark, size: 30),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.check_circle,
                        size: 16, color: AppColors.success),
                    const SizedBox(width: 4),
                    const Text(
                      'Uploaded',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.success,
                      ),
                    ),
                    Text(
                      '  •  $kb KB',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  doc.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textDark,
                  ),
                ),
                Row(
                  children: [
                    TextButton.icon(
                      onPressed: () => _pick(context),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 32),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      icon: const Icon(Icons.refresh, size: 18),
                      label: const Text('Replace'),
                    ),
                    const SizedBox(width: 12),
                    TextButton.icon(
                      onPressed: () => onChanged(null),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 32),
                        foregroundColor: AppColors.error,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      icon: const Icon(Icons.delete_outline, size: 18),
                      label: const Text('Remove'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  final Color color;

  _DashedBorderPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(
        Offset.zero & size,
        const Radius.circular(14),
      ));
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        canvas.drawPath(metric.extractPath(d, d + 6), paint);
        d += 11;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) => old.color != color;
}
