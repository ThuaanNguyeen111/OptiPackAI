import 'package:sqflite/sqflite.dart';

import 'action_queue.dart';
import 'pending_action.dart';

class SqliteActionQueue implements ActionQueue {
  SqliteActionQueue(this._db);

  final Database _db;

  static const _table = 'pending_actions';

  @override
  Future<void> enqueue(PendingAction action) => _db.insert(
        _table,
        action.toRow(),
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );

  Future<List<PendingAction>> _byStatus(PendingStatus status) async {
    final rows = await _db.query(
      _table,
      where: 'status = ?',
      whereArgs: [status.name],
      orderBy: 'created_at ASC',
    );
    return rows.map(PendingAction.fromRow).toList();
  }

  @override
  Future<List<PendingAction>> pending() => _byStatus(PendingStatus.pending);

  @override
  Future<List<PendingAction>> failed() => _byStatus(PendingStatus.failed);

  @override
  Future<void> remove(String id) =>
      _db.delete(_table, where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> markFailed(String id, {required String message, String? code}) =>
      _db.update(
        _table,
        {
          'status': PendingStatus.failed.name,
          'last_error': message,
          'last_error_code': code,
          'next_attempt_at': null,
        },
        where: 'id = ?',
        whereArgs: [id],
      );

  @override
  Future<void> reschedule(String id, {required int attempts, required DateTime nextAttemptAt}) =>
      _db.update(
        _table,
        {
          'attempts': attempts,
          'next_attempt_at': nextAttemptAt.millisecondsSinceEpoch,
        },
        where: 'id = ?',
        whereArgs: [id],
      );

  @override
  Future<void> requeue(String id) => _db.update(
        _table,
        {
          'status': PendingStatus.pending.name,
          'attempts': 0,
          'next_attempt_at': null,
          'last_error': null,
          'last_error_code': null,
        },
        where: 'id = ?',
        whereArgs: [id],
      );
}
