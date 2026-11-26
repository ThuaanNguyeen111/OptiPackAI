import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../auth/auth_models.dart';
import '../stock/api_stock_repository.dart';
import '../stock/stock_repository.dart';
import '../stock/stock_screen.dart';
import '../warehouse/scanner_screen.dart';
import 'intake_sheet.dart';

enum _Tab { bins, lots, receipts }

enum _StockFilter { all, inStock, empty }

/// Loại dòng sổ kho, giống `MOVEMENT_LABELS` của web (thêm các loại BE ghi khi hủy / đổi hàng).
const movementLabels = <String, String>{
  'assign_initial': 'Gán lần đầu',
  'receive': 'Nhập hàng',
  'pick': 'Lấy hàng',
  'adjust': 'Kiểm kê',
  'transfer_out': 'Chuyển đi',
  'transfer_in': 'Chuyển đến',
  'return_restock': 'Hàng hoàn nhập lại',
  'sku_merge': 'Gộp tồn',
  'pick_cancel': 'Hủy lượt lấy',
  'pack_replace': 'Đổi món lúc đóng gói',
  'cancel_unpack': 'Tháo kiện đơn hủy',
  'cancel_return': 'Trả kệ đơn hủy',
  'reject_return': 'Trả kệ khi đóng gói từ chối',
};

class _InventoryData {
  const _InventoryData(this.warehouses, this.warehouseId, this.rows, {this.binCodes = const {}});
  final List<Map<String, dynamic>> warehouses;
  final String? warehouseId;
  final List<Map<String, dynamic>> rows;

  /// Mọi mã ô của kho (viết hoa), để phân biệt "ô trống" với "không có ô này".
  final Set<String> binCodes;
}

/// Ghép mã khu, sức chứa, thứ tự đi vào từng dòng tồn và sắp như web.
List<Map<String, dynamic>> joinStockRows(
  List<Map<String, dynamic>> assignments,
  List<Map<String, dynamic>> bins,
  List<Map<String, dynamic>> zones,
) {
  final zoneById = {for (final z in zones) pickString(z, ['id', '_id']): pickString(z, ['zoneCode'])};
  final binById = {for (final b in bins) pickString(b, ['id', '_id']): b};
  final rows = [
    for (final a in assignments)
      if (binById[pickString(a, ['binLocationId'])] case final bin)
        {
          ...a,
          'binCode': pickString(bin, ['binCode'], pickString(a, ['binCode'], '—')),
          'zoneCode': zoneById[pickString(bin, ['zoneId'])] ?? '',
          'capacity': bin?['capacity'],
          'pickSequence': bin?['pickSequence'],
        },
  ];
  int bySequence(Map<String, dynamic> a, Map<String, dynamic> b) {
    final x = a['pickSequence'], y = b['pickSequence'];
    if (x is num && y is num) return x.compareTo(y);
    if (x is num) return -1;
    if (y is num) return 1;
    return '${a['binCode']}'.compareTo('${b['binCode']}');
  }

  return rows..sort(bySequence);
}

/// Tình trạng kho: tồn theo ô, theo lô, phiếu nhập và sổ kho.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key, this.embedded = false});

  /// true = nằm trong tab "Kho" (không có thanh tiêu đề riêng).
  final bool embedded;

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _list = GlobalKey<LoadListState<_InventoryData>>();
  _Tab _tab = _Tab.bins;
  String? _warehouseId;
  String _search = '';
  String _zone = '';
  _StockFilter _stock = _StockFilter.all;
  final _searchField = TextEditingController();

  @override
  void dispose() {
    _searchField.dispose();
    super.dispose();
  }

  ApiClient get _api => ref.read(apiClientProvider);
  String get _base => '/warehouse/warehouses/$_warehouseId';

  Future<_InventoryData> _load() async {
    final warehouses = [
      for (final w in rowsOf(await _api.get('/warehouse/warehouses')))
        if (w['isActive'] != false) w,
    ];
    final ids = [for (final w in warehouses) pickString(w, ['id', '_id'])];
    if (!ids.contains(_warehouseId)) _warehouseId = ids.isEmpty ? null : ids.first;
    if (_warehouseId == null) return _InventoryData(warehouses, null, const []);
    final rows = rowsOf(await switch (_tab) {
      _Tab.bins => _api.get('$_base/sku-bin-assignments'),
      _Tab.lots => _api.get('$_base/lots'),
      _Tab.receipts => _api.get('$_base/receipts', query: {'limit': 100}),
    });
    if (_tab != _Tab.bins) return _InventoryData(warehouses, _warehouseId, rows);
    final bins = rowsOf(await _api.get('$_base/bin-locations'));
    final zones = rowsOf(await _api.get('$_base/zones'));
    return _InventoryData(
      warehouses,
      _warehouseId,
      joinStockRows(rows, bins, zones),
      binCodes: {for (final b in bins) pickString(b, ['binCode']).toUpperCase()},
    );
  }

  Future<void> _run(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _list.currentState?.reload();
  }

  Future<void> _restock(Map<String, dynamic> a) async {
    final body = await showIntakeSheet(context, title: 'Nhập thêm ${a['sellerSku']}', allowNoPhoto: true);
    if (body == null || !mounted) return;
    body.remove('note');
    await _run(
        () => _api.post('$_base/sku-bin-assignments/${a['id']}/restock',
            body: {...body, 'client_event_id': const Uuid().v4()}),
        'Đã nhập thêm.');
  }

  /// Nhập thêm / kiểm kê / chuyển ô trên kho đang chọn.
  Future<void> _stockAction(Map<String, dynamic> a) async {
    final warehouseId = _warehouseId!;
    final capacity = a['capacity'];
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => StockActionSheet(
        item: parseStockItem(a, capacity: capacity is num ? capacity.toInt() : null),
        binCode: pickString(a, ['binCode'], '—'),
        repository: ApiStockRepository(api: _api, warehouseId: () async => warehouseId),
      ),
    );
    if (changed == true) await _list.currentState?.reload();
  }

  Future<void> _openRow(Map<String, dynamic> a) async {
    final isAdmin = ref.read(authControllerProvider).user?.role == UserRole.admin;
    final id = pickString(a, ['id', '_id']);
    final sku = pickString(a, ['sellerSku']);
    final choice = await showModalBottomSheet<VoidCallback>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) {
        Widget tile(IconData icon, String label, VoidCallback action) => ListTile(
              leading: Icon(icon),
              title: Text(label),
              onTap: () => Navigator.pop(ctx, action),
            );
        return SafeArea(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text('$sku · ô ${a['binCode']} · tồn ${pickInt(a, ['quantityOnHand'])}',
                      textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                tile(Icons.edit_note, 'Nhập thêm, kiểm kê, chuyển ô', () => _stockAction(a)),
                if (isAdmin) tile(Icons.add_box_outlined, 'Nhập thêm (được bỏ ảnh)', () => _restock(a)),
                tile(Icons.layers_outlined, 'Lô trên ô',
                    () => _history('Lô $sku', '$_base/sku-bin-assignments/$id/lots')),
                tile(Icons.list_alt, 'Sổ kho',
                    () => _history('Sổ kho $sku', '$_base/sku-bin-assignments/$id/movements')),
              ],
            ),
          ),
        );
      },
    );
    if (mounted) choice?.call();
  }

  Widget _binRow(Map<String, dynamic> r) {
    final quantity = pickInt(r, ['quantityOnHand']);
    final capacity = r['capacity'];
    final zone = pickString(r, ['zoneCode']);
    final master = pickString(r, ['masterSku']);
    return RecordCard(
      mono: true,
      title: pickString(r, ['binCode'], '—'),
      lines: [
        if (zone.isNotEmpty) 'Khu $zone',
        pickString(r, ['sellerSku']),
        [pickString(r, ['platform']), pickString(r, ['shopId']), master].where((s) => s.isNotEmpty).join(' · '),
      ],
      trailing: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Pill(capacity is num ? '$quantity / $capacity' : '$quantity',
            quantity > 0 ? AppColors.good : AppColors.warning),
      ),
      onTap: () => _openRow(r),
    );
  }

  Future<void> _scan() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen()),
    );
    if (code == null || !mounted) return;
    _searchField.text = code;
    setState(() => _search = code.trim().toLowerCase());
  }

  Future<void> _history(String title, String path) => openPage(
        context,
        SubPage(
          title: title,
          child: LoadList<List<Map<String, dynamic>>>(
            load: () async => rowsOf(await _api.get(path)),
            builder: (_, rows, _) => [
              if (rows.isEmpty) emptyNote('Chưa có dòng nào.'),
              for (final r in rows)
                r.containsKey('lotCode')
                    ? _lotCard(r)
                    : RecordCard(
                        title:
                            '${pickInt(r, ['delta']) > 0 ? '+' : ''}${pickInt(r, ['delta'])} · ${movementLabels[r['type']] ?? r['type']}',
                        lines: [
                          _reasonLabel(pickString(r, ['reasonCode', 'reason'])),
                          pickString(r, ['note']),
                          dateTimeText(r['createdAt']),
                        ],
                      ),
            ],
          ),
        ),
      );

  static String _reasonLabel(String code) {
    for (final r in StockAdjustReason.values) {
      if (r.code == code) return r.label;
    }
    return code;
  }

  Widget _lotCard(Map<String, dynamic> l) => RecordCard(
        mono: true,
        title: '${pickString(l, ['lotCode'])} · ${pickString(l, ['sellerSku'])}',
        lines: [
          'Còn ${pickInt(l, ['quantityRemaining'])} / nhập ${pickInt(l, ['quantityReceived'])}',
          'Ngày nhập ${dateTimeText(l['receivedAt'])}',
          if (l['masterSku'] != null) 'Tồn chung ${l['masterSku']}',
        ],
      );

  Future<void> _receipt(Map<String, dynamic> r) => openPage(
        context,
        SubPage(
          title: pickString(r, ['receiptCode'], 'Phiếu nhập'),
          child: LoadList<Map<String, dynamic>>(
            load: () async => asMap(await _api.get('$_base/receipts/${r['id']}')) ?? {},
            builder: (_, d, _) => [
              RecordCard(title: 'Lô ${pickString(d, ['lotCode'])}', lines: [
                'Tổng ${pickInt(d, ['totalQuantity'])}',
                pickString(d, ['supplier']),
                pickString(d, ['note']),
                dateTimeText(d['receivedAt']),
                if (d['noPhotoReason'] != null) 'Không có ảnh: ${d['noPhotoReason']}',
              ]),
              for (final line in rowsOf(d['lines']))
                RecordCard(mono: true, title: '${pickInt(line, ['quantity'])} × ${pickString(line, ['sellerSku'])}'),
              if (d['documentPhotoUrls'] is List)
                for (final url in d['documentPhotoUrls'] as List)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Image.network('$url',
                        errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined)),
                  ),
            ],
          ),
        ),
      );

  Widget _card(Map<String, dynamic> r) => switch (_tab) {
        _Tab.bins => _binRow(r),
        _Tab.lots => _lotCard(r),
        _Tab.receipts => RecordCard(
            title: pickString(r, ['receiptCode']),
            lines: [
              'Lô ${pickString(r, ['lotCode'])} · tổng ${pickInt(r, ['totalQuantity'])}',
              pickString(r, ['supplier']),
              dateTimeText(r['createdAt']),
            ],
            onTap: () => _receipt(r),
          ),
      };

  /// Lọc theo khu, còn/hết hàng (chỉ mục "Theo ô") và ô tìm kiếm.
  bool _matches(Map<String, dynamic> r) {
    if (_tab == _Tab.bins) {
      if (_zone.isNotEmpty && r['zoneCode'] != _zone) return false;
      final quantity = pickInt(r, ['quantityOnHand']);
      if (_stock == _StockFilter.inStock && quantity <= 0) return false;
      if (_stock == _StockFilter.empty && quantity > 0) return false;
    }
    return '${r['sellerSku']} ${r['masterSku']} ${r['binCode']} ${r['lotCode']} ${r['receiptCode']} ${r['shopId']}'
        .toLowerCase()
        .contains(_search);
  }

  List<Widget> _binFilters(List<Map<String, dynamic>> rows) {
    final zones = ({for (final r in rows) pickString(r, ['zoneCode'])}..remove('')).toList()..sort();
    final units = rows.fold<int>(0, (sum, r) => sum + pickInt(r, ['quantityOnHand']));
    final empty = rows.where((r) => pickInt(r, ['quantityOnHand']) <= 0).length;
    return [
      chipRow<_StockFilter>(
          const [(_StockFilter.all, 'Tất cả'), (_StockFilter.inStock, 'Còn hàng'), (_StockFilter.empty, 'Hết hàng')],
          _stock,
          (v) => setState(() => _stock = v)),
      if (zones.length > 1) ...[
        const SizedBox(height: 4),
        chipRow<String>([('', 'Mọi khu'), for (final z in zones) (z, z)], _zone, (v) => setState(() => _zone = v)),
      ],
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text('${rows.length} dòng tồn · $units cái · $empty dòng hết hàng',
            style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final list = LoadList<_InventoryData>(
      key: _list,
      resetKey: '$_tab $_warehouseId',
      load: _load,
      header: [
        chipRow<_Tab>(const [(_Tab.bins, 'Theo ô'), (_Tab.lots, 'Theo lô'), (_Tab.receipts, 'Phiếu nhập')], _tab,
            (t) => setState(() => _tab = t)),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _searchField,
                onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
                decoration: const InputDecoration(
                    hintText: 'Tìm SKU, mã ô, mã lô', prefixIcon: Icon(Icons.search), isDense: true),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Quét ô bằng camera',
              style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: _scan,
              icon: const Icon(Icons.qr_code_scanner),
            ),
          ],
        ),
        const SizedBox(height: 8),
      ],
      builder: (context, data, reload) {
        final shown = data.rows.where(_matches).toList();
        final emptyBin = _tab == _Tab.bins &&
            data.binCodes.contains(_search.toUpperCase()) &&
            !data.rows.any((r) => '${r['binCode']}'.toUpperCase() == _search.toUpperCase());
        return [
          if (data.warehouses.isEmpty) emptyNote('Chưa có kho nào đang hoạt động.'),
          if (data.warehouses.isNotEmpty) ...[
            DropdownButtonFormField<String>(
              key: ValueKey(data.warehouseId),
              initialValue: data.warehouseId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Kho', isDense: true),
              items: [
                for (final w in data.warehouses)
                  DropdownMenuItem(
                    value: pickString(w, ['id', '_id']),
                    child: Text(
                      [pickString(w, ['warehouseCode']), pickString(w, ['warehouseName'])]
                          .where((s) => s.isNotEmpty)
                          .join(' · '),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: (id) => setState(() {
                _warehouseId = id;
                _zone = '';
              }),
            ),
            const SizedBox(height: 8),
          ],
          if (_tab == _Tab.bins && data.warehouseId != null) ..._binFilters(data.rows),
          if (emptyBin)
            emptyNote('Ô ${_search.toUpperCase()} chưa có hàng.')
          else if (shown.isEmpty)
            emptyNote('Không có dòng nào.'),
          for (final r in shown.take(200)) _card(r),
          if (shown.length > 200) emptyNote('Đang hiện 200/${shown.length} dòng — hãy lọc thêm.'),
        ];
      },
    );
    return widget.embedded ? list : SubPage(title: 'Tình trạng kho', child: list);
  }
}
