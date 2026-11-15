import 'dart:convert';

import 'package:sqflite/sqflite.dart';

class CachedJson {
  const CachedJson(this.value, this.savedAt);
  final Object? value;
  final DateTime savedAt;
}

/// Bộ nhớ đệm JSON để mở danh sách khi mất mạng (số trên máy có thể cũ).
abstract class JsonCache {
  Future<void> write(String key, Object? value);
  Future<CachedJson?> read(String key);
}

class SqliteJsonCache implements JsonCache {
  SqliteJsonCache(this._db);

  final Database _db;

  @override
  Future<void> write(String key, Object? value) => _db.insert(
        'json_cache',
        {
          'key': key,
          'value': jsonEncode(value),
          'saved_at': DateTime.now().millisecondsSinceEpoch,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );

  @override
  Future<CachedJson?> read(String key) async {
    final rows = await _db.query('json_cache', where: 'key = ?', whereArgs: [key], limit: 1);
    if (rows.isEmpty) return null;
    final row = rows.first;
    return CachedJson(
      jsonDecode(row['value']! as String),
      DateTime.fromMillisecondsSinceEpoch(row['saved_at']! as int),
    );
  }
}

class InMemoryJsonCache implements JsonCache {
  final Map<String, CachedJson> _items = {};

  @override
  Future<void> write(String key, Object? value) async =>
      _items[key] = CachedJson(jsonDecode(jsonEncode(value)), DateTime.now());

  @override
  Future<CachedJson?> read(String key) async => _items[key];
}
