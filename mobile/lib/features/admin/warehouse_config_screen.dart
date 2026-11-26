import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';

const _all = {'include_inactive': 'true'};

String _id(Map<String, dynamic> m) => pickString(m, ['id', '_id']);

Widget _offPill(Map<String, dynamic> m) =>
    m['isActive'] == false ? Pill('Đã tắt', AppColors.inkSubtle) : Pill('Đang dùng', AppColors.good);

/// Hỏi lại rồi xóa hẳn. Mục đã từng có hàng thì BE từ chối (chỉ vô hiệu hóa được).
Future<bool> _confirmPurge(BuildContext context, String name) => confirmDialog(context,
    title: 'Xóa hẳn $name?', message: 'Chỉ xóa được khi chưa từng dùng. Không hoàn tác được.', confirmLabel: 'Xóa hẳn');

/// Cấu hình kho: danh sách kho.
class WarehouseConfigScreen extends ConsumerStatefulWidget {
  const WarehouseConfigScreen({super.key});

  @override
  ConsumerState<WarehouseConfigScreen> createState() => _WarehouseConfigScreenState();
}

class _WarehouseConfigScreenState extends ConsumerState<WarehouseConfigScreen> {
  final _list = GlobalKey<LoadListState<List<Map<String, dynamic>>>>();

  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> _run(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _list.currentState?.reload();
  }

  Future<void> _edit(Map<String, dynamic>? w) async {
    final v = await showFormSheet(context, title: w == null ? 'Thêm kho' : 'Sửa kho', fields: [
      if (w == null) const FormFieldSpec('warehouse_code', 'Mã kho', required: true, hint: 'Không sửa được sau khi tạo'),
      FormFieldSpec('warehouse_name', 'Tên kho', required: true, initial: w?['warehouseName']),
      FormFieldSpec('address', 'Địa chỉ', required: w == null, initial: w?['address']),
    ]);
    if (v == null || !mounted) return;
    await _run(
        () => w == null ? _api.post('/warehouse/warehouses', body: v) : _api.patch('/warehouse/warehouses/${_id(w)}', body: v),
        'Đã lưu kho.');
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Cấu hình kho',
      floatingAction: FloatingActionButton.extended(
          onPressed: () => _edit(null), icon: const Icon(Icons.add), label: const Text('Thêm kho')),
      child: LoadList<List<Map<String, dynamic>>>(
        key: _list,
        load: () async => rowsOf(await _api.get('/warehouse/warehouses', query: _all)),
        builder: (context, rows, _) => [
          if (rows.isEmpty) emptyNote('Chưa có kho nào.'),
          for (final w in rows)
            RecordCard(
              title: '${w['warehouseCode']} · ${w['warehouseName']}',
              lines: [pickString(w, ['address'])],
              pills: [_offPill(w)],
              onTap: () async {
                await openPage(context, WarehouseDetailScreen(warehouse: w));
                await _list.currentState?.reload();
              },
              actions: [
                CardAction('Sửa', () => _edit(w), icon: Icons.edit_outlined),
                if (w['isActive'] == false)
                  CardAction('Bật lại', () => _run(() => _api.post('/warehouse/warehouses/${_id(w)}/reactivate'), 'Đã bật lại kho.'),
                      icon: Icons.restart_alt)
                else
                  CardAction('Vô hiệu hóa', () async {
                    if (await confirmDialog(context,
                            title: 'Vô hiệu hóa kho?', message: 'Khu và ô bên trong cũng bị tắt. Kho còn hàng thì không tắt được.') &&
                        mounted) {
                      await _run(() => _api.delete('/warehouse/warehouses/${_id(w)}'), 'Đã vô hiệu hóa.');
                    }
                  }, icon: Icons.block, danger: true),
                CardAction('Xóa hẳn', () async {
                  if (await _confirmPurge(context, '${w['warehouseCode']}') && mounted) {
                    await _run(() => _api.delete('/warehouse/warehouses/${_id(w)}/permanent'), 'Đã xóa.');
                  }
                }, icon: Icons.delete_forever_outlined, danger: true),
              ],
            ),
        ],
      ),
    );
  }
}

enum _Part { zones, bins, assignments }

class WarehouseDetailScreen extends ConsumerStatefulWidget {
  const WarehouseDetailScreen({super.key, required this.warehouse});

  final Map<String, dynamic> warehouse;

  @override
  ConsumerState<WarehouseDetailScreen> createState() => _WarehouseDetailScreenState();
}

class _WarehouseDetailScreenState extends ConsumerState<WarehouseDetailScreen> {
  final _list = GlobalKey<LoadListState<List<Map<String, dynamic>>>>();
  _Part _part = _Part.zones;
  String _search = '';

  ApiClient get _api => ref.read(apiClientProvider);
  String get _wid => _id(widget.warehouse);
  String get _base => '/warehouse/warehouses/$_wid';

  Future<List<Map<String, dynamic>>> _load() async => switch (_part) {
        _Part.zones => rowsOf(await _api.get('$_base/zones', query: _all)),
        _Part.bins => rowsOf(await _api.get('$_base/bin-locations', query: _all)),
        _Part.assignments => rowsOf(await _api.get('$_base/sku-bin-assignments')),
      };

  Future<void> _run(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _list.currentState?.reload();
  }

  /// Mã ô → id ô. Báo lỗi và trả `null` khi không tìm thấy.
  Future<String?> _binId(String code) async {
    String? id;
    await runAction(context, () async {
      final res = asMap(await _api.get('$_base/bins/by-code/${Uri.encodeComponent(code)}'));
      id = pickStringOrNull(asMap(res?['bin']), ['id', '_id']);
    });
    return id;
  }

  Future<Map<String, String>> _categoryOptions() async {
    var out = <String, String>{};
    await runAction(context, () async {
      out = {
        for (final c in rowsOf(await _api.get('/categories')))
          if (pickInt(c, ['level']) == 2) '${c['code']}': '${c['code']} · ${c['name']}',
      };
    });
    return out;
  }

  // ---- Khu ----

  Future<void> _editZone(Map<String, dynamic>? z) async {
    final v = await showFormSheet(context, title: z == null ? 'Thêm khu' : 'Sửa khu ${z['zoneCode']}', fields: [
      if (z == null) const FormFieldSpec('zone_code', 'Mã khu (KA…KZ)', required: true),
      FormFieldSpec('zone_name', 'Tên khu', required: true, initial: z?['zoneName']),
      FormFieldSpec('description', 'Mô tả', initial: z?['description']),
    ]);
    if (v == null || !mounted) return;
    await _run(() => z == null ? _api.post('$_base/zones', body: v) : _api.patch('/warehouse/zones/${_id(z)}', body: v),
        'Đã lưu khu.');
  }

  Future<void> _createRack(Map<String, dynamic> zone) async {
    final categories = await _categoryOptions();
    if (!mounted) return;
    final v = await showFormSheet(context, title: 'Tạo kệ trong khu ${zone['zoneCode']}', submitLabel: 'Tạo kệ', fields: [
      const FormFieldSpec('aisle', 'Dãy (VD D1)', required: true),
      const FormFieldSpec('side', 'Bên', type: FieldType.choice, required: true, options: {'T': 'Trái', 'P': 'Phải'}),
      const FormFieldSpec('bay', 'Số kệ', type: FieldType.integer, required: true),
      FormFieldSpec('category_code', 'Danh mục', type: FieldType.choice, required: true, options: categories),
      const FormFieldSpec('tiers', 'Size từng tầng', required: true, hint: 'VD 1:S, 2:M, 3:L'),
      const FormFieldSpec('cells_per_tier', 'Số ô mỗi tầng', type: FieldType.integer, required: true, initial: 3),
      const FormFieldSpec('capacity_per_cell', 'Sức chứa mỗi ô', type: FieldType.integer),
    ]);
    if (v == null || !mounted) return;
    final tiers = <Map<String, dynamic>>[];
    for (final part in (v['tiers'] as String).split(',')) {
      final pair = part.split(':');
      final tier = pair.length == 2 ? int.tryParse(pair[0].trim()) : null;
      if (tier == null || pair[1].trim().isEmpty) {
        showToast(context, 'Size từng tầng phải theo dạng 1:S, 2:M.', error: true);
        return;
      }
      tiers.add({'tier': tier, 'size': pair[1].trim().toUpperCase()});
    }
    v['tiers'] = tiers;
    await _run(() => _api.post('/warehouse/zones/${_id(zone)}/racks', body: v), 'Đã tạo kệ.');
  }

  Future<void> _purgeRack(Map<String, dynamic> zone) async {
    final v = await showFormSheet(context,
        title: 'Xóa hẳn kệ / dãy',
        note: 'Chỉ xóa được khi mọi ô chưa từng có hàng.',
        submitLabel: 'Xóa',
        fields: const [
          FormFieldSpec('aisle', 'Dãy', required: true),
          FormFieldSpec('side', 'Bên', type: FieldType.choice, options: {'T': 'Trái', 'P': 'Phải'}),
          FormFieldSpec('bay', 'Số kệ', type: FieldType.integer),
        ]);
    if (v == null || !mounted) return;
    final query = [for (final e in v.entries) '${e.key}=${Uri.encodeQueryComponent('${e.value}')}'].join('&');
    await _run(() => _api.delete('/warehouse/zones/${_id(zone)}/racks/permanent?$query'), 'Đã xóa.');
  }

  Widget _zoneCard(Map<String, dynamic> z) => RecordCard(
        title: '${z['zoneCode']} · ${z['zoneName']}',
        lines: [pickString(z, ['description'])],
        pills: [_offPill(z)],
        actions: [
          CardAction('Sửa', () => _editZone(z), icon: Icons.edit_outlined),
          CardAction('Tạo kệ', () => _createRack(z), icon: Icons.grid_on),
          CardAction('Xóa hẳn kệ / dãy', () => _purgeRack(z), icon: Icons.grid_off, danger: true),
          if (z['isActive'] == false)
            CardAction('Bật lại', () => _run(() => _api.post('/warehouse/zones/${_id(z)}/reactivate'), 'Đã bật lại.'),
                icon: Icons.restart_alt)
          else
            CardAction('Vô hiệu hóa', () => _run(() => _api.delete('/warehouse/zones/${_id(z)}'), 'Đã vô hiệu hóa.'),
                icon: Icons.block, danger: true),
          CardAction('Xóa hẳn khu', () async {
            if (await _confirmPurge(context, 'khu ${z['zoneCode']}') && mounted) {
              await _run(() => _api.delete('/warehouse/zones/${_id(z)}/permanent'), 'Đã xóa.');
            }
          }, icon: Icons.delete_forever_outlined, danger: true),
        ],
      );

  // ---- Ô kệ ----

  Future<void> _editBin(Map<String, dynamic> b) async {
    final d = asMap(b['designated']);
    final v = await showFormSheet(context, title: 'Sửa ô ${b['binCode']}', fields: [
      FormFieldSpec('capacity', 'Sức chứa', type: FieldType.integer, initial: b['capacity']),
      FormFieldSpec('designated_category_code', 'Danh mục đăng ký', initial: d?['categoryCode']),
      FormFieldSpec('designated_size', 'Size đăng ký', initial: d?['size']),
      FormFieldSpec('designated_color_code', 'Màu đăng ký', initial: d?['colorCode']),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.patch('/warehouse/bin-locations/${_id(b)}', body: v), 'Đã lưu ô.');
  }

  Widget _binCard(Map<String, dynamic> b) {
    final d = asMap(b['designated']);
    return RecordCard(
      mono: true,
      title: pickString(b, ['binCode']),
      lines: [
        if (b['capacity'] != null) 'Sức chứa ${b['capacity']}',
        if (d != null)
          [d['categoryCode'], d['size'], d['colorCode']].whereType<String>().join(' · '),
      ],
      pills: [_offPill(b)],
      actions: [
        CardAction('Sửa', () => _editBin(b), icon: Icons.edit_outlined),
        if (b['isActive'] == false)
          CardAction('Bật lại', () => _run(() => _api.post('/warehouse/bin-locations/${_id(b)}/reactivate'), 'Đã bật lại.'),
              icon: Icons.restart_alt)
        else
          CardAction('Vô hiệu hóa', () => _run(() => _api.delete('/warehouse/bin-locations/${_id(b)}'), 'Đã vô hiệu hóa.'),
              icon: Icons.block, danger: true),
        CardAction('Xóa hẳn', () async {
          if (await _confirmPurge(context, 'ô ${b['binCode']}') && mounted) {
            await _run(() => _api.delete('/warehouse/bin-locations/${_id(b)}/permanent'), 'Đã xóa.');
          }
        }, icon: Icons.delete_forever_outlined, danger: true),
      ],
    );
  }

  // ---- Gán SKU ----

  Future<void> _assign() async {
    final unassigned = <String, Map<String, dynamic>>{};
    await runAction(context, () async {
      for (final r in rowsOf(await _api.get('/warehouse/sku-bin-assignments/unassigned'))) {
        unassigned['${r['platform']}|${r['shop_id']}|${r['seller_sku']}'] = r;
      }
    });
    if (!mounted) return;
    if (unassigned.isEmpty) {
      showToast(context, 'Không còn SKU nào chưa gán ô.');
      return;
    }
    final v = await showFormSheet(context, title: 'Gán SKU vào ô', submitLabel: 'Gán', fields: [
      FormFieldSpec('sku', 'SKU chưa gán', type: FieldType.choice, required: true, options: {
        for (final e in unassigned.entries) e.key: '${e.value['seller_sku']} (${e.value['platform']})',
      }),
      const FormFieldSpec('bin_code', 'Mã ô', required: true),
      const FormFieldSpec('confirm_other_bin', 'Cho phép dù SKU đã nằm ở ô khác', type: FieldType.toggle),
      const FormFieldSpec('force', 'Cho phép vượt sức chứa', type: FieldType.toggle),
    ]);
    if (v == null || !mounted) return;
    final binId = await _binId(v['bin_code'] as String);
    final sku = unassigned[v['sku']];
    if (binId == null || sku == null || !mounted) return;
    await _run(
        () => _api.post('$_base/sku-bin-assignments', body: {
              'platform': pickString(sku, ['platform'], 'lazada'),
              'shop_id': sku['shop_id'],
              'seller_sku': sku['seller_sku'],
              'bin_location_id': binId,
              'confirm_other_bin': v['confirm_other_bin'],
              'force': v['force'],
            }),
        'Đã gán SKU. Nhập tồn ở mục Tình trạng kho.');
  }

  Future<void> _move(Map<String, dynamic> a) async {
    final v = await showFormSheet(context, title: 'Sửa gán nhầm ô', submitLabel: 'Chuyển', fields: const [
      FormFieldSpec('bin_code', 'Mã ô đúng', required: true),
      FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    final binId = await _binId(v.remove('bin_code') as String);
    if (binId == null || !mounted) return;
    await _run(() => _api.patch('$_base/sku-bin-assignments/${_id(a)}', body: {...v, 'to_bin_location_id': binId}),
        'Đã chuyển ô.');
  }

  Widget _assignmentCard(Map<String, dynamic> a) => RecordCard(
        mono: true,
        title: pickString(a, ['sellerSku']),
        lines: [
          'Ô ${pickString(a, ['binCode'], '—')} · tồn ${pickInt(a, ['quantityOnHand'])}',
          '${a['platform']} · shop ${a['shopId']}',
          if (a['masterSku'] != null) 'Tồn chung ${a['masterSku']}',
        ],
        actions: [
          CardAction('Sửa gán nhầm ô', () => _move(a), icon: Icons.drive_file_move_outline),
          CardAction('Bỏ gán', () async {
            if (await confirmDialog(context, title: 'Bỏ gán SKU?', message: 'Chỉ bỏ được khi tồn bằng 0.') && mounted) {
              await _run(() => _api.delete('$_base/sku-bin-assignments/${_id(a)}'), 'Đã bỏ gán.');
            }
          }, icon: Icons.link_off, danger: true),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final addLabel = switch (_part) { _Part.zones => 'Thêm khu', _Part.assignments => 'Gán SKU', _Part.bins => null };
    return SubPage(
      title: '${widget.warehouse['warehouseCode']}',
      floatingAction: addLabel == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _part == _Part.zones ? _editZone(null) : _assign(),
              icon: const Icon(Icons.add),
              label: Text(addLabel),
            ),
      child: LoadList<List<Map<String, dynamic>>>(
        key: _list,
        resetKey: _part,
        load: _load,
        header: [
          chipRow<_Part>(const [(_Part.zones, 'Khu & kệ'), (_Part.bins, 'Ô kệ'), (_Part.assignments, 'Gán SKU')], _part,
              (p) => setState(() => _part = p)),
          const SizedBox(height: 8),
          TextField(
            onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            decoration: const InputDecoration(hintText: 'Lọc theo mã', prefixIcon: Icon(Icons.search), isDense: true),
          ),
          const SizedBox(height: 8),
        ],
        builder: (context, rows, _) {
          final shown = rows
              .where((r) => '${r['zoneCode']} ${r['binCode']} ${r['sellerSku']} ${r['masterSku']}'
                  .toLowerCase()
                  .contains(_search))
              .toList();
          return [
            if (shown.isEmpty) emptyNote('Không có mục nào.'),
            for (final r in shown.take(200))
              switch (_part) {
                _Part.zones => _zoneCard(r),
                _Part.bins => _binCard(r),
                _Part.assignments => _assignmentCard(r),
              },
            if (shown.length > 200) emptyNote('Đang hiện 200/${shown.length} mục — lọc thêm để thấy mục khác.'),
          ];
        },
      ),
    );
  }
}
