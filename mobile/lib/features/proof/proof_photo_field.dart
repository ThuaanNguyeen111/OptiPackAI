import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/colors.dart';
import 'proof_photo_repository.dart';

/// Chọn tối đa [maxProofPhotos] ảnh bằng chứng (chụp hoặc lấy từ máy). Ảnh được thu nhỏ 1600 px
/// trước khi gửi; việc tải lên do màn hình gọi [ProofPhotoRepository.upload] lúc xác nhận.
class ProofPhotoField extends StatelessWidget {
  const ProofPhotoField({
    super.key,
    required this.photos,
    required this.onChanged,
    this.label = 'Ảnh bằng chứng',
    this.required = false,
    this.enabled = true,
    this.picker,
  });

  final List<XFile> photos;
  final ValueChanged<List<XFile>> onChanged;
  final String label;
  final bool required;
  final bool enabled;
  final ImagePicker? picker;

  Future<void> _pick(BuildContext context, ImageSource source) async {
    try {
      final file = await (picker ?? ImagePicker()).pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
      );
      if (file != null) onChanged([...photos, file]);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không mở được ${source == ImageSource.camera ? 'camera' : 'thư viện ảnh'}.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final full = photos.length >= maxProofPhotos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '$label (${photos.length}/$maxProofPhotos)${required ? ' — bắt buộc' : ' — không bắt buộc'}',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: required && photos.isEmpty ? AppColors.warningText : AppColors.ink,
          ),
        ),
        if (photos.isNotEmpty) ...[
          const SizedBox(height: 8),
          SizedBox(
            height: 76,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: photos.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) => Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(File(photos[i].path), width: 76, height: 76, fit: BoxFit.cover),
                  ),
                  Positioned(
                    top: 2,
                    right: 2,
                    child: InkWell(
                      onTap: enabled ? () => onChanged([...photos]..removeAt(i)) : null,
                      child: Container(
                        decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                        padding: const EdgeInsets.all(2),
                        child: const Icon(Icons.close, size: 16, color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: enabled && !full ? () => _pick(context, ImageSource.camera) : null,
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Chụp ảnh'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: enabled && !full ? () => _pick(context, ImageSource.gallery) : null,
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Chọn ảnh'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
