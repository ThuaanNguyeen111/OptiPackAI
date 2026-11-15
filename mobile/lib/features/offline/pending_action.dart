import 'dart:convert';

enum PendingStatus { pending, failed }

/// Một thao tác **ghi** chờ gửi lên BE.
///
/// Chỉ dùng cho 5 route có `client_event_id` (BE không ghi trùng khi gửi lại cùng mã):
/// `pick-item`, quét món đóng gói, `restock`, `adjust`, `transfer`.
/// Nút dùng `expected_version` (niêm phong, vận đơn, duyệt hàng hoàn…) KHÔNG vào hàng đợi.
class PendingAction {
  PendingAction({
    required this.id,
    required this.kind,
    required this.label,
    required this.path,
    required this.body,
    required this.createdAt,
    this.attempts = 0,
    this.nextAttemptAt,
    this.status = PendingStatus.pending,
    this.lastError,
    this.lastErrorCode,
  });

  /// Chính là `client_event_id`: sinh **lúc người dùng bấm**, giữ nguyên qua mọi lần gửi lại.
  final String id;

  /// Loại thao tác, để nhóm và hiển thị (vd `pick_item`).
  final String kind;

  /// Câu hiển thị cho người dùng, vd "Lấy 2 × AOPOLO-030-BE-L".
  final String label;

  /// Đường dẫn BE (POST), vd `/order-groups/<id>/fulfillment/pick-item`.
  final String path;

  /// Body đã có sẵn `client_event_id`.
  final Map<String, dynamic> body;

  final DateTime createdAt;
  final int attempts;
  final DateTime? nextAttemptAt;
  final PendingStatus status;
  final String? lastError;
  final String? lastErrorCode;

  PendingAction copyWith({
    int? attempts,
    DateTime? nextAttemptAt,
    bool clearNextAttempt = false,
    PendingStatus? status,
    String? lastError,
    String? lastErrorCode,
    bool clearError = false,
  }) {
    return PendingAction(
      id: id,
      kind: kind,
      label: label,
      path: path,
      body: body,
      createdAt: createdAt,
      attempts: attempts ?? this.attempts,
      nextAttemptAt: clearNextAttempt ? null : (nextAttemptAt ?? this.nextAttemptAt),
      status: status ?? this.status,
      lastError: clearError ? null : (lastError ?? this.lastError),
      lastErrorCode: clearError ? null : (lastErrorCode ?? this.lastErrorCode),
    );
  }

  Map<String, Object?> toRow() => {
        'id': id,
        'kind': kind,
        'label': label,
        'path': path,
        'body': jsonEncode(body),
        'created_at': createdAt.millisecondsSinceEpoch,
        'attempts': attempts,
        'next_attempt_at': nextAttemptAt?.millisecondsSinceEpoch,
        'status': status.name,
        'last_error': lastError,
        'last_error_code': lastErrorCode,
      };

  factory PendingAction.fromRow(Map<String, Object?> row) {
    final next = row['next_attempt_at'];
    return PendingAction(
      id: row['id']! as String,
      kind: row['kind']! as String,
      label: row['label']! as String,
      path: row['path']! as String,
      body: Map<String, dynamic>.from(
        jsonDecode(row['body']! as String) as Map,
      ),
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at']! as int),
      attempts: row['attempts']! as int,
      nextAttemptAt:
          next is int ? DateTime.fromMillisecondsSinceEpoch(next) : null,
      status: PendingStatus.values.byName(row['status']! as String),
      lastError: row['last_error'] as String?,
      lastErrorCode: row['last_error_code'] as String?,
    );
  }
}
