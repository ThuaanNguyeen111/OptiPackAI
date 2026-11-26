/// Khung dùng chung cho các màn quản trị: tải danh sách, thẻ có menu thao tác, biểu mẫu trượt lên
/// và chạy thao tác ghi (báo thành công / lỗi). Các màn này chỉ dùng khi có mạng, gọi thẳng [ApiClient].
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/colors.dart';
import '../core/json.dart';
import '../core/network/api_exception.dart';
import 'widgets.dart';

String errorText(Object error) => error is ApiException ? error.message : error.toString();

/// Danh sách bản ghi từ nhiều dạng trả về của BE: mảng trần hoặc `{ data | items | <key>: [...] }`.
List<Map<String, dynamic>> rowsOf(Object? raw, [String? key]) {
  var list = raw;
  final map = asMap(raw);
  if (map != null) {
    for (final k in [?key, 'data', 'items', 'results']) {
      if (map[k] is List) {
        list = map[k];
        break;
      }
    }
  }
  return [
    if (list is List)
      for (final row in list) ?asMap(row),
  ];
}

/// Chạy thao tác ghi. Trả `true` khi thành công.
Future<bool> runAction(
  BuildContext context,
  Future<void> Function() action, {
  String? success,
}) async {
  try {
    await action();
    if (context.mounted && success != null) showToast(context, success);
    return true;
  } catch (e) {
    if (context.mounted) showToast(context, errorText(e), error: true);
    return false;
  }
}

/// Màn con mở từ menu: có thanh tiêu đề riêng.
class SubPage extends StatelessWidget {
  const SubPage({super.key, required this.title, required this.child, this.actions, this.floatingAction});

  final String title;
  final Widget child;
  final List<Widget>? actions;
  final Widget? floatingAction;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title), actions: actions),
        floatingActionButton: floatingAction,
        body: SafeArea(child: child),
      );
}

Future<T?> openPage<T>(BuildContext context, Widget page) =>
    Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));

/// Tải dữ liệu một lần, kéo xuống để tải lại. `builder` trả về các phần tử của danh sách.
class LoadList<T> extends StatefulWidget {
  const LoadList({super.key, required this.load, required this.builder, this.header, this.resetKey});

  /// Đổi giá trị này (đổi tab có dạng dữ liệu khác) thì bỏ dữ liệu cũ và tải lại.
  final Object? resetKey;

  final Future<T> Function() load;
  final List<Widget> Function(BuildContext context, T data, Future<void> Function() reload) builder;

  /// Phần cố định phía trên (bộ lọc); giữ nguyên khi đang tải lại.
  final List<Widget>? header;

  @override
  State<LoadList<T>> createState() => LoadListState<T>();
}

class LoadListState<T> extends State<LoadList<T>> {
  T? _data;
  Object? _error;
  bool _loading = true;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    reload();
  }

  @override
  void didUpdateWidget(LoadList<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.resetKey != widget.resetKey) {
      _data = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => reload());
    }
  }

  Future<void> reload() async {
    if (!mounted) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.load();
      if (!mounted || request != _request) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || request != _request) return;
      setState(() {
        _error = e;
        _data = null;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return RefreshIndicator(
      onRefresh: reload,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
        children: [
          ...?widget.header,
          if (_loading) const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  Icon(Icons.error_outline, size: 48, color: AppColors.inkTertiary),
                  const SizedBox(height: 8),
                  Text(errorText(_error!), textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(onPressed: reload, child: const Text('Thử lại')),
                ],
              ),
            ),
          if (data != null) ...widget.builder(context, data, reload),
        ],
      ),
    );
  }
}

Widget emptyNote(String text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSubtle)),
    );

Widget sectionTitle(String text) => Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 8),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
    );

class CardAction {
  const CardAction(this.label, this.onTap, {this.icon, this.danger = false});
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool danger;
}

/// Thẻ một bản ghi: tiêu đề, các dòng phụ, nhãn và menu thao tác.
class RecordCard extends StatelessWidget {
  const RecordCard({
    super.key,
    required this.title,
    this.lines = const [],
    this.pills = const [],
    this.actions = const [],
    this.onTap,
    this.trailing,
    this.mono = false,
  });

  final String title;
  final List<String> lines;
  final List<Widget> pills;
  final List<CardAction> actions;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 4, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(fontWeight: FontWeight.w800, fontFamily: mono ? 'monospace' : null),
                      ),
                      for (final line in lines)
                        if (line.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 3),
                            child: Text(line, style: TextStyle(fontSize: 13, color: AppColors.inkSubtle)),
                          ),
                      if (pills.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Wrap(spacing: 6, runSpacing: 6, children: pills),
                        ),
                    ],
                  ),
                ),
                ?trailing,
                if (actions.isNotEmpty)
                  PopupMenuButton<int>(
                    tooltip: 'Thao tác',
                    onSelected: (i) => actions[i].onTap(),
                    itemBuilder: (_) => [
                      for (var i = 0; i < actions.length; i++)
                        PopupMenuItem(
                          value: i,
                          child: Row(
                            children: [
                              if (actions[i].icon != null) ...[
                                Icon(actions[i].icon, size: 18, color: actions[i].danger ? AppColors.danger : null),
                                const SizedBox(width: 10),
                              ],
                              Flexible(
                                child: Text(
                                  actions[i].label,
                                  style: TextStyle(color: actions[i].danger ? AppColors.danger : null),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  )
                else
                  const SizedBox(width: 10),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum FieldType { text, multiline, password, integer, decimal, toggle, choice, multi }

class FormFieldSpec {
  const FormFieldSpec(
    this.key,
    this.label, {
    this.type = FieldType.text,
    this.initial,
    this.required = false,
    this.options = const {},
    this.hint,
    this.sendEmpty = false,
  });

  final String key;
  final String label;
  final FieldType type;
  final Object? initial;
  final bool required;

  /// Cho [FieldType.choice]: giá trị gửi đi → nhãn hiển thị.
  final Map<String, String> options;
  final String? hint;

  /// Ô chữ để trống vẫn gửi chuỗi rỗng (dùng khi sửa để xoá giá trị).
  final bool sendEmpty;
}

/// Đổi chữ người dùng gõ thành số; nhận cả dấu phẩy thập phân.
num? parseNumber(String text, {bool integer = false}) {
  final t = text.trim().replaceAll(',', '.');
  return integer ? int.tryParse(t) : num.tryParse(t);
}

/// Biểu mẫu trượt lên. Trả `null` khi đóng; ô để trống (không bắt buộc) bị bỏ khỏi kết quả.
Future<Map<String, dynamic>?> showFormSheet(
  BuildContext context, {
  required String title,
  required List<FormFieldSpec> fields,
  String submitLabel = 'Lưu',
  String? note,
}) =>
    showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FormSheet(title: title, fields: fields, submitLabel: submitLabel, note: note),
    );

class _FormSheet extends StatefulWidget {
  const _FormSheet({required this.title, required this.fields, required this.submitLabel, this.note});

  final String title;
  final List<FormFieldSpec> fields;
  final String submitLabel;
  final String? note;

  @override
  State<_FormSheet> createState() => _FormSheetState();
}

class _FormSheetState extends State<_FormSheet> {
  final Map<String, TextEditingController> _text = {};
  final Map<String, bool> _flags = {};
  final Map<String, String?> _choices = {};
  final Map<String, Set<String>> _multi = {};
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final f in widget.fields) {
      switch (f.type) {
        case FieldType.toggle:
          _flags[f.key] = f.initial == true;
        case FieldType.multi:
          final list = f.initial;
          _multi[f.key] = {if (list is Iterable) for (final v in list) '$v'};
        case FieldType.choice:
          final initial = f.initial?.toString();
          _choices[f.key] = f.options.containsKey(initial) ? initial : null;
        default:
          _text[f.key] = TextEditingController(text: f.initial?.toString() ?? '');
      }
    }
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final result = <String, dynamic>{};
    for (final f in widget.fields) {
      if (f.type == FieldType.toggle) {
        result[f.key] = _flags[f.key] ?? false;
        continue;
      }
      if (f.type == FieldType.multi) {
        final picked = [for (final k in f.options.keys) if (_multi[f.key]!.contains(k)) k];
        if (picked.isEmpty && f.required) {
          setState(() => _error = 'Hãy chọn "${f.label}".');
          return;
        }
        result[f.key] = picked;
        continue;
      }
      final raw = f.type == FieldType.choice ? (_choices[f.key] ?? '') : _text[f.key]!.text;
      final value = f.type == FieldType.password ? raw : raw.trim();
      if (value.isEmpty) {
        if (f.required) {
          setState(() => _error = 'Hãy nhập "${f.label}".');
          return;
        }
        if (f.sendEmpty) result[f.key] = '';
        continue;
      }
      if (f.type == FieldType.integer || f.type == FieldType.decimal) {
        final number = parseNumber(value, integer: f.type == FieldType.integer);
        if (number == null) {
          setState(() => _error = '"${f.label}" phải là số${f.type == FieldType.integer ? ' nguyên' : ''}.');
          return;
        }
        result[f.key] = number;
        continue;
      }
      result[f.key] = value;
    }
    Navigator.pop(context, result);
  }

  Widget _field(FormFieldSpec f) {
    switch (f.type) {
      case FieldType.multi:
        final selected = _multi[f.key]!;
        return InputDecorator(
          decoration: InputDecoration(labelText: f.required ? '${f.label} *' : f.label, helperText: f.hint),
          child: Wrap(
            spacing: 6,
            children: [
              for (final o in f.options.entries)
                FilterChip(
                  label: Text(o.value),
                  selected: selected.contains(o.key),
                  onSelected: (v) => setState(() => v ? selected.add(o.key) : selected.remove(o.key)),
                ),
            ],
          ),
        );
      case FieldType.toggle:
        return SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(f.label),
          subtitle: f.hint == null ? null : Text(f.hint!),
          value: _flags[f.key] ?? false,
          onChanged: (v) => setState(() => _flags[f.key] = v),
        );
      case FieldType.choice:
        return DropdownButtonFormField<String>(
          initialValue: _choices[f.key],
          isExpanded: true,
          decoration: InputDecoration(labelText: f.required ? '${f.label} *' : f.label, helperText: f.hint),
          items: [
            if (!f.required) const DropdownMenuItem(value: '', child: Text('—')),
            for (final o in f.options.entries)
              DropdownMenuItem(value: o.key, child: Text(o.value, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => _choices[f.key] = v,
        );
      default:
        final numeric = f.type == FieldType.integer || f.type == FieldType.decimal;
        return TextField(
          controller: _text[f.key],
          obscureText: f.type == FieldType.password,
          maxLines: f.type == FieldType.multiline ? 3 : 1,
          keyboardType: numeric
              ? TextInputType.numberWithOptions(decimal: f.type == FieldType.decimal, signed: true)
              : null,
          inputFormatters: f.type == FieldType.integer
              ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9-]'))]
              : null,
          decoration: InputDecoration(
            labelText: f.required ? '${f.label} *' : f.label,
            helperText: f.hint,
            helperMaxLines: 3,
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            if (widget.note != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(widget.note!, style: TextStyle(fontSize: 13, color: AppColors.inkSubtle)),
              ),
            const SizedBox(height: 14),
            for (final f in widget.fields) ...[_field(f), const SizedBox(height: 12)],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(_error!, style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              ),
            FilledButton(onPressed: _submit, child: Text(widget.submitLabel)),
          ],
        ),
      ),
    );
  }
}

/// Nhãn nhỏ gọn cho hàng bộ lọc cuộn ngang.
Widget chipRow<T>(List<(T, String)> options, T selected, ValueChanged<T> onSelected) => SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final o in options)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(label: Text(o.$2), selected: o.$1 == selected, onSelected: (_) => onSelected(o.$1)),
            ),
        ],
      ),
    );

String shortId(String id) => id.length > 10 ? id.substring(id.length - 10) : id;

/// `dd/MM/yyyy HH:mm` theo giờ máy; chuỗi rỗng khi không đọc được.
String dateTimeText(Object? iso) {
  final t = iso is String ? DateTime.tryParse(iso)?.toLocal() : null;
  if (t == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(t.day)}/${two(t.month)}/${t.year} ${two(t.hour)}:${two(t.minute)}';
}

/// Hiện một giá trị chỉ xem được một lần (mật khẩu tạm, mã dự phòng) kèm nút sao chép.
Future<void> showSecret(BuildContext context, {required String title, required String value, String? note}) =>
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        scrollable: true,
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (note != null) ...[Text(note), const SizedBox(height: 12)],
            SelectableText(value, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: value));
              if (ctx.mounted) showToast(ctx, 'Đã sao chép.');
            },
            child: const Text('Sao chép'),
          ),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
        ],
      ),
    );
