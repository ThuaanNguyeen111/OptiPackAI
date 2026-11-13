import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';

/// BE nhận tối đa 3 ảnh mỗi thao tác, mỗi ảnh ≤ 10 MB (`POST /proof-photos`).
const maxProofPhotos = 3;

/// Đọc `{ photos: [{ url, ... }] }` của `POST /proof-photos`.
List<String> parseProofPhotoUrls(Object? response) {
  final photos = asMap(response)?['photos'];
  if (photos is! List) return const [];
  return [
    for (final p in photos)
      if (pickString(asMap(p), ['url']).isNotEmpty) pickString(asMap(p), ['url']),
  ];
}

/// Tải ảnh bằng chứng lên BE (Cloudinary). Chỉ gửi khi có mạng — không đưa vào hàng đợi ngoại tuyến.
class ProofPhotoRepository {
  const ProofPhotoRepository(this.api);

  final ApiClient api;

  /// Trả về link ảnh theo đúng thứ tự gửi. Danh sách rỗng thì không gọi BE.
  Future<List<String>> upload(List<XFile> files) async {
    if (files.isEmpty) return const [];
    if (files.length > maxProofPhotos) {
      throw const ApiException(message: 'Tối đa $maxProofPhotos ảnh mỗi lần.');
    }
    final form = FormData();
    for (final f in files) {
      form.files.add(MapEntry('files', await MultipartFile.fromFile(f.path, filename: f.name)));
    }
    final urls = parseProofPhotoUrls(await api.upload('/proof-photos', form));
    if (urls.length != files.length) {
      throw const ApiException(message: 'Máy chủ không trả đủ link ảnh. Thử lại.');
    }
    return urls;
  }
}

final proofPhotoRepositoryProvider =
    Provider<ProofPhotoRepository>((ref) => ProofPhotoRepository(ref.watch(apiClientProvider)));
