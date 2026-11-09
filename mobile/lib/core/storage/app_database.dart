import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

/// SQLite của app: hàng đợi thao tác ngoại tuyến + bộ nhớ đệm danh sách (đọc khi mất mạng).
class AppDatabase {
  const AppDatabase._();

  static Future<Database> open() async {
    final dir = await getDatabasesPath();
    return openDatabase(
      p.join(dir, 'optipack_mobile.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE pending_actions (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            label TEXT NOT NULL,
            path TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at INTEGER,
            status TEXT NOT NULL,
            last_error TEXT,
            last_error_code TEXT
          )
        ''');
        await db.execute('''
          CREATE TABLE json_cache (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            saved_at INTEGER NOT NULL
          )
        ''');
      },
    );
  }
}
