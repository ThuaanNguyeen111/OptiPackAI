import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'marketplace_screen.dart';

const productCategoryLabels = {
  't_shirt': 'Áo thun',
  'shirt': 'Áo sơ mi',
  'jacket': 'Áo khoác',
  'shorts': 'Quần đùi / short',
  'trousers': 'Quần dài / jean',
  'dress': 'Váy / đầm',
  'shoes': 'Giày (hộp)',
  'sandals': 'Dép / sandal',
  'bag': 'Túi xách',
  'accessory': 'Phụ kiện',
  'other': 'Khác',
};

const _clothing = {'t_shirt', 'shirt', 'jacket', 'shorts', 'trousers', 'dress'};

enum _Tab { profiles, skus, unmapped, categories, colors }

const _tabLabels = {
  _Tab.profiles: 'Số đo SKU',
  _Tab.skus: 'SKU nội bộ',
  _Tab.unmapped: 'SKU sàn chưa nối',
  _Tab.categories: 'Danh mục',
  _Tab.colors: 'Màu',
};

/// Hồ sơ đóng gói, SKU nội bộ và danh mục (phần "Catalog" của trang Cấu hình kho trên web).
class CatalogScreen extends ConsumerStatefulWidget {
  const CatalogScreen({super.key});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  final _list = GlobalKey<LoadListState<List<Map<String, dynamic>>>>();
  _Tab _tab = _Tab.profiles;
  String _search = '';
  String _profileStatus = 'needs_measurement';

  ApiClient get _api => ref.read(apiClientProvider);

  Future<List<Map<String, dynamic>>> _load() async => switch (_tab) {
        _Tab.profiles => rowsOf(await _api.get('/product-master', query: {'status': _profileStatus, 'search': _search})),
        _Tab.skus => rowsOf(
            await _api.get('/master-skus', query: {'search': _search, 'include_inactive': 'true', 'limit': 100})),
        _Tab.unmapped => rowsOf(await _api.get('/master-skus/unmapped-seller-skus')),
        _Tab.categories => rowsOf(await _api.get('/categories', query: {'include_inactive': 'true'})),
        _Tab.colors => rowsOf(await _api.get('/colors', query: {'include_inactive': 'true'})),
      };

  Future<void> _run(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _list.currentState?.reload();
  }

  // ---- Số đo SKU ----

  Future<void> _profile(Map<String, dynamic> p) async {
    final d = asMap(p['dimension']) ?? asMap(p['marketplaceDimension']);
    Object? dim(String camel, String snake) => d?[camel] ?? d?[snake];
    final measured = p['packagingProfileStatus'] == 'ready';
    final v = await showFormSheet(context,
        title: '${p['sellerSku']}',
        note: measured
            ? 'Đo sau khi đã gấp / bọc. Giày đo nguyên hộp; có túi zip thì đo sau khi cho vào túi.'
            : 'Số điền sẵn (nếu có) là số khai trên sàn — hãy đo và cân lại trước khi lưu.',
        fields: [
          FormFieldSpec('length_cm', 'Dài (cm)', type: FieldType.decimal, required: true, initial: dim('lengthCm', 'length_cm')),
          FormFieldSpec('width_cm', 'Rộng (cm)', type: FieldType.decimal, required: true, initial: dim('widthCm', 'width_cm')),
          FormFieldSpec('height_cm', 'Cao / độ dày (cm)',
              type: FieldType.decimal, initial: dim('heightCm', 'height_cm'), hint: 'Quần áo được để trống'),
          FormFieldSpec('weight_kg', 'Nặng (kg)', type: FieldType.decimal, required: true, initial: dim('weightKg', 'weight_kg')),
          FormFieldSpec('product_category', 'Loại hàng',
              type: FieldType.choice, required: true, options: productCategoryLabels, initial: p['productCategory']),
          FormFieldSpec('fabric_gsm', 'Định lượng vải (GSM)', type: FieldType.integer, initial: p['fabricGsm']),
          FormFieldSpec('is_fragile', 'Dễ vỡ', type: FieldType.toggle, initial: p['isFragile']),
          FormFieldSpec('orientation_rule', 'Hướng xếp',
              type: FieldType.choice,
              required: true,
              options: const {'any': 'Xoay tự do', 'upright_only': 'Chỉ đứng (giữ cạnh Cao hướng lên)'},
              initial: p['orientationRule'] ?? 'any'),
          FormFieldSpec('max_stack_load_kg', 'Tải chồng tối đa (kg)',
              type: FieldType.decimal, initial: p['maxStackLoadKg'], hint: 'Để trống = mặc định của loại hàng'),
          FormFieldSpec('outer_requirement', 'Lớp ngoài',
              type: FieldType.choice,
              options: const {'mailer_ok': 'Được dùng túi niêm phong', 'box_required': 'Bắt buộc thùng'},
              initial: p['outerRequirement']),
          FormFieldSpec('zip_bag_code', 'Mã túi zip', initial: p['zipBagCode']),
          FormFieldSpec('zip_bag_folded', 'Gập đôi túi', type: FieldType.toggle, initial: p['zipBagFolded']),
          FormFieldSpec('can_fold_in_half', 'Có thể gập đôi hàng (chỉ quần áo)',
              type: FieldType.toggle, initial: p['canFoldInHalf']),
        ]);
    if (v == null || !mounted) return;
    final category = v['product_category'] as String;
    if (!_clothing.contains(category)) {
      v['can_fold_in_half'] = false;
      v.remove('fabric_gsm');
      if (!v.containsKey('height_cm')) {
        showToast(context, 'Loại hàng này phải nhập chiều cao.', error: true);
        return;
      }
    }
    // BE ghi đè bằng giá trị gửi lên nên luôn gửi 2 ô này (null = bỏ).
    v.putIfAbsent('outer_requirement', () => null);
    v.putIfAbsent('max_stack_load_kg', () => null);
    await _run(() => _api.put('/product-master/${p['id']}/packaging-profile', body: v), 'Đã xác nhận số đo.');
  }

  Widget _profileCard(Map<String, dynamic> p) {
    final ready = p['packagingProfileStatus'] == 'ready';
    final d = asMap(p['dimension']);
    final retired = p['retired'] == true;
    return RecordCard(
      mono: true,
      title: pickString(p, ['sellerSku']),
      lines: [
        '${platformNames[p['platform']] ?? p['platform']} · shop ${p['shopId']}',
        if (ready && d != null)
          '${formatDimsCm(pickDouble(d, ['lengthCm', 'length_cm']), pickDouble(d, ['widthCm', 'width_cm']), pickDouble(d, ['heightCm', 'height_cm']))}'
              ' · ${formatKg(pickDouble(d, ['weightKg', 'weight_kg']))}',
        if (p['productCategory'] != null) productCategoryLabels[p['productCategory']] ?? '${p['productCategory']}',
      ],
      pills: [
        Pill(ready ? 'Đã đo' : 'Chưa đo', ready ? AppColors.good : AppColors.warning),
        if (retired) Pill('Ngừng dùng', AppColors.inkSubtle),
      ],
      onTap: () => _profile(p),
      actions: [
        CardAction('Nhập / sửa số đo', () => _profile(p), icon: Icons.straighten),
        CardAction(retired ? 'Dùng lại SKU' : 'Ngừng dùng SKU',
            () => _run(() => _api.patch('/product-master/${p['id']}/retire', body: {'retired': !retired}), 'Đã cập nhật.'),
            icon: Icons.visibility_off_outlined),
      ],
    );
  }

  // ---- SKU nội bộ ----

  static List<FormFieldSpec> _skuAttrs(Map<String, dynamic>? s) => [
        FormFieldSpec('name', 'Tên', initial: s?['name']),
        FormFieldSpec('gender', 'Giới tính',
            type: FieldType.choice, options: const {'nam': 'Nam', 'nu': 'Nữ', 'unisex': 'Unisex'}, initial: s?['gender']),
        FormFieldSpec('length_cm', 'Dài (cm)', type: FieldType.decimal, initial: s?['lengthCm']),
        FormFieldSpec('width_cm', 'Rộng (cm)', type: FieldType.decimal, initial: s?['widthCm']),
        FormFieldSpec('height_cm', 'Cao (cm)', type: FieldType.decimal, initial: s?['heightCm']),
        FormFieldSpec('weight_kg', 'Nặng (kg)', type: FieldType.decimal, initial: s?['weightKg']),
        FormFieldSpec('is_fragile', 'Dễ vỡ', type: FieldType.toggle, initial: s?['isFragile']),
      ];

  Future<({Map<String, String> categories, Map<String, String> colors})> _skuOptions() async {
    var categories = <String, String>{};
    var colors = <String, String>{};
    await runAction(context, () async {
      categories = {
        for (final c in rowsOf(await _api.get('/categories')))
          if (pickInt(c, ['level']) == 2) '${c['code']}': '${c['code']} · ${c['name']}',
      };
      colors = {for (final c in rowsOf(await _api.get('/colors'))) '${c['code']}': '${c['code']} · ${c['name']}'};
    });
    return (categories: categories, colors: colors);
  }

  Future<void> _createSku() async {
    final o = await _skuOptions();
    if (!mounted) return;
    final v = await showFormSheet(context, title: 'Tạo SKU nội bộ', note: 'Mã SKU do hệ thống ghép từ 4 ô đầu.', fields: [
      FormFieldSpec('category_code', 'Danh mục', type: FieldType.choice, required: true, options: o.categories),
      const FormFieldSpec('model_no', 'Số mẫu (1–999)', type: FieldType.integer, required: true),
      FormFieldSpec('color_code', 'Màu', type: FieldType.choice, required: true, options: o.colors),
      const FormFieldSpec('size', 'Size', required: true),
      ..._skuAttrs(null),
    ]);
    if (v == null || !mounted) return;
    v['size'] = (v['size'] as String).toUpperCase();
    await _run(() => _api.post('/master-skus', body: v), 'Đã tạo SKU.');
  }

  Future<void> _editSku(Map<String, dynamic> s) async {
    final v = await showFormSheet(context, title: 'Sửa ${s['masterSku']}', fields: _skuAttrs(s));
    if (v == null || !mounted) return;
    await _run(() => _api.patch('/master-skus/${s['masterSku']}', body: v), 'Đã lưu.');
  }

  Future<void> _replaceSku(Map<String, dynamic> s) async {
    final o = await _skuOptions();
    if (!mounted) return;
    final v = await showFormSheet(context,
        title: 'Thay thế ${s['masterSku']}',
        note: 'Tạo SKU mới, chuyển tồn và liên kết sang, khóa SKU cũ.',
        submitLabel: 'Thay thế',
        fields: [
          FormFieldSpec('category_code', 'Danh mục', type: FieldType.choice, options: o.categories, initial: s['categoryCode']),
          FormFieldSpec('model_no', 'Số mẫu', type: FieldType.integer, initial: s['modelNo']),
          FormFieldSpec('color_code', 'Màu', type: FieldType.choice, options: o.colors, initial: s['colorCode']),
          FormFieldSpec('size', 'Size', initial: s['size']),
          const FormFieldSpec('reason', 'Lý do', required: true),
        ]);
    if (v == null || !mounted) return;
    await _run(() => _api.post('/master-skus/${s['masterSku']}/replace', body: v), 'Đã thay thế SKU.');
  }

  Future<void> _mapSku(String code, [Map<String, dynamic>? seller]) async {
    final v = await showFormSheet(context, title: 'Nối SKU sàn vào $code', submitLabel: 'Nối', fields: [
      FormFieldSpec('platform', 'Sàn',
          type: FieldType.choice, required: true, options: platformNames, initial: seller?['platform']),
      FormFieldSpec('shop_id', 'Mã shop', required: true, initial: seller?['shop_id']),
      FormFieldSpec('seller_sku', 'SKU sàn', required: true, initial: seller?['seller_sku']),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.post('/master-skus/$code/mappings', body: v), 'Đã nối SKU.');
  }

  Future<void> _mapUnmapped(Map<String, dynamic> seller) async {
    final v = await showFormSheet(context, title: 'Nối ${seller['seller_sku']}', submitLabel: 'Tiếp tục', fields: const [
      FormFieldSpec('code', 'Mã SKU nội bộ', required: true),
    ]);
    if (v == null || !mounted) return;
    await _mapSku((v['code'] as String).toUpperCase(), seller);
  }

  Future<void> _mappings(String code) => openPage(
        context,
        SubPage(
          title: 'Liên kết của $code',
          child: LoadList<List<Map<String, dynamic>>>(
            load: () async => rowsOf(await _api.get('/master-skus/$code/mappings')),
            builder: (ctx, rows, reload) => [
              if (rows.isEmpty) emptyNote('Chưa nối SKU sàn nào.'),
              for (final m in rows)
                RecordCard(
                  mono: true,
                  title: pickString(m, ['sellerSku']),
                  lines: ['${platformNames[m['platform']] ?? m['platform']} · shop ${m['shopId']}'],
                  actions: [
                    CardAction('Bỏ nối', () async {
                      await runAction(ctx, () async => _api.delete('/master-skus/mappings/${m['id']}'),
                          success: 'Đã bỏ nối.');
                      await reload();
                    }, icon: Icons.link_off, danger: true),
                  ],
                ),
            ],
          ),
        ),
      );

  Widget _skuCard(Map<String, dynamic> s) {
    final code = pickString(s, ['masterSku']);
    final active = s['isActive'] != false;
    return RecordCard(
      mono: true,
      title: code,
      lines: [pickString(s, ['name']), if (s['replacedBy'] != null) 'Đã thay bằng ${s['replacedBy']}'],
      pills: [
        if (!active) Pill('Đã tắt', AppColors.inkSubtle),
        if (s['isFragile'] == true) Pill('Dễ vỡ', AppColors.danger),
      ],
      actions: [
        CardAction('SKU sàn đã nối', () => _mappings(code), icon: Icons.list_alt),
        CardAction('Nối SKU sàn', () => _mapSku(code), icon: Icons.add_link),
        CardAction('Sửa', () => _editSku(s), icon: Icons.edit_outlined),
        CardAction('Thay thế SKU', () => _replaceSku(s), icon: Icons.swap_horiz),
        CardAction(
          active ? 'Vô hiệu hóa' : 'Bật lại',
          () => _run(() => active ? _api.delete('/master-skus/$code') : _api.post('/master-skus/$code/reactivate'),
              'Đã cập nhật.'),
          icon: Icons.power_settings_new,
          danger: active,
        ),
        CardAction('Xóa hẳn', () async {
          if (await confirmDialog(context, title: 'Xóa hẳn $code?', message: 'Chỉ xóa được khi chưa từng dùng.') &&
              mounted) {
            await _run(() => _api.delete('/master-skus/$code/permanent'), 'Đã xóa.');
          }
        }, icon: Icons.delete_forever_outlined, danger: true),
      ],
    );
  }

  // ---- Danh mục & màu ----

  static List<String> _sizes(Object? text) => [
        for (final s in '${text ?? ''}'.split(','))
          if (s.trim().isNotEmpty) s.trim().toUpperCase(),
      ];

  Future<void> _editCategory(Map<String, dynamic>? c) async {
    final scale = c?['sizeScale'];
    final v = await showFormSheet(context, title: c == null ? 'Thêm danh mục' : 'Sửa ${c['code']}', fields: [
      if (c == null) ...const [
        FormFieldSpec('code', 'Mã (chữ hoa / số)', required: true),
        FormFieldSpec('parent_code', 'Mã danh mục cha', hint: 'Để trống = danh mục cấp 1'),
      ],
      FormFieldSpec('name', 'Tên', required: true, initial: c?['name']),
      FormFieldSpec('size_scale', 'Thang size (cấp 2)',
          initial: scale is List ? scale.join(', ') : null, hint: 'VD S, M, L'),
    ]);
    if (v == null || !mounted) return;
    final sizes = _sizes(v.remove('size_scale'));
    if (sizes.isNotEmpty) v['size_scale'] = sizes;
    await _run(() => c == null ? _api.post('/categories', body: v) : _api.patch('/categories/${c['code']}', body: v),
        'Đã lưu danh mục.');
  }

  Future<void> _editColor(Map<String, dynamic>? c) async {
    final v = await showFormSheet(context, title: c == null ? 'Thêm màu' : 'Sửa ${c['code']}', fields: [
      if (c == null) const FormFieldSpec('code', 'Mã màu (VD DEN)', required: true),
      FormFieldSpec('name', 'Tên màu', required: true, initial: c?['name']),
      FormFieldSpec('hex', 'Mã hex (VD #000000)', initial: c?['hex']),
    ]);
    if (v == null || !mounted) return;
    await _run(() => c == null ? _api.post('/colors', body: v) : _api.patch('/colors/${c['code']}', body: v), 'Đã lưu màu.');
  }

  Widget _codeCard(Map<String, dynamic> c, String base, Future<void> Function() edit, List<String> lines) {
    final active = c['isActive'] != false;
    return RecordCard(
      title: '${c['code']} · ${c['name']}',
      lines: lines,
      pills: [if (!active) Pill('Đã tắt', AppColors.inkSubtle)],
      actions: [
        CardAction('Sửa', edit, icon: Icons.edit_outlined),
        CardAction(
          active ? 'Vô hiệu hóa' : 'Bật lại',
          () => _run(
              () => active ? _api.delete('$base/${c['code']}') : _api.post('$base/${c['code']}/reactivate'),
              'Đã cập nhật.'),
          icon: Icons.power_settings_new,
          danger: active,
        ),
      ],
    );
  }

  Widget _card(Map<String, dynamic> r) => switch (_tab) {
        _Tab.profiles => _profileCard(r),
        _Tab.skus => _skuCard(r),
        _Tab.unmapped => RecordCard(
            mono: true,
            title: pickString(r, ['seller_sku']),
            lines: ['${platformNames[r['platform']] ?? r['platform']} · shop ${r['shop_id']}'],
            actions: [CardAction('Nối vào SKU nội bộ', () => _mapUnmapped(r), icon: Icons.add_link)],
          ),
        _Tab.categories => _codeCard(r, '/categories', () => _editCategory(r), [
            if (r['parentCode'] != null) 'Thuộc ${r['parentCode']}',
            if (r['sizeScale'] is List && (r['sizeScale'] as List).isNotEmpty) 'Size ${(r['sizeScale'] as List).join(', ')}',
          ]),
        _Tab.colors => _codeCard(r, '/colors', () => _editColor(r), [pickString(r, ['hex'])]),
      };

  @override
  Widget build(BuildContext context) {
    final add = switch (_tab) {
      _Tab.skus => _createSku,
      _Tab.categories => () => _editCategory(null),
      _Tab.colors => () => _editColor(null),
      _ => null,
    };
    final searchable = _tab == _Tab.profiles || _tab == _Tab.skus;
    return SubPage(
      title: 'SKU & danh mục',
      actions: [
        if (_tab == _Tab.profiles)
          IconButton(
            tooltip: 'Đồng bộ sản phẩm từ sàn',
            icon: const Icon(Icons.sync),
            onPressed: () => _run(() => _api.post('/product-master/sync'), 'Đã đồng bộ sản phẩm.'),
          ),
        if (_tab == _Tab.unmapped)
          IconButton(
            tooltip: 'Tính lại tồn chung',
            icon: const Icon(Icons.merge),
            onPressed: () => _run(() => _api.post('/master-skus/sync-stock'), 'Đã tính lại tồn chung.'),
          ),
      ],
      floatingAction: add == null
          ? null
          : FloatingActionButton.extended(onPressed: () => add(), icon: const Icon(Icons.add), label: const Text('Thêm')),
      child: LoadList<List<Map<String, dynamic>>>(
        key: _list,
        resetKey: '$_tab $_profileStatus',
        load: _load,
        header: [
          chipRow<_Tab>([for (final e in _tabLabels.entries) (e.key, e.value)], _tab, (t) => setState(() {
                _tab = t;
                _search = '';
              })),
          if (_tab == _Tab.profiles)
            chipRow<String>(const [('needs_measurement', 'Chưa đo'), ('ready', 'Đã đo'), ('', 'Tất cả')], _profileStatus,
                (s) => setState(() => _profileStatus = s)),
          if (searchable) ...[
            const SizedBox(height: 8),
            TextField(
              key: ValueKey(_tab),
              textInputAction: TextInputAction.search,
              onSubmitted: (v) {
                _search = v.trim();
                _list.currentState?.reload();
              },
              decoration: const InputDecoration(hintText: 'Tìm SKU', prefixIcon: Icon(Icons.search), isDense: true),
            ),
          ],
          const SizedBox(height: 8),
        ],
        builder: (context, rows, _) => [
          if (rows.isEmpty) emptyNote('Không có mục nào.'),
          for (final r in rows.take(200)) _card(r),
          if (rows.length > 200) emptyNote('Đang hiện 200/${rows.length} mục — hãy tìm theo SKU.'),
        ],
      ),
    );
  }
}
