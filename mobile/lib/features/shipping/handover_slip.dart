import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'shipping_repository.dart';

/// Cùng cột với "Xuất biên bản (CSV)" của web.
String shipmentQueueCsv(List<ShipGroup> groups, List<ShipmentView> shipments) => [
      'kind,shipment_code,order_group_id,status,attempts',
      for (final g in groups) 'packed,,${g.id},packed,',
      for (final v in shipments) 'shipment,${v.code},${v.groupId},${v.status.code},${v.attempt}/$maxDeliveryAttempts',
    ].join('\n');

/// UTF-8 kèm BOM để bảng tính đọc đúng tiếng Việt.
Uint8List csvBytes(String csv) => Uint8List.fromList([0xEF, 0xBB, 0xBF, ...utf8.encode(csv)]);

/// Mở hộp "Lưu thành file" của máy.
Future<void> saveCsvFile(BuildContext context, String fileName, String csv) async {
  var saved = false;
  final ok = await runAction(context, () async {
    saved = await FilePicker.saveFile(fileName: fileName, bytes: csvBytes(csv), mimeType: 'text/csv') != null;
  });
  if (ok && saved && context.mounted) showToast(context, 'Đã lưu $fileName.');
}

/// Mỗi dòng: STT, mã vận đơn, mã nhóm kiện, người nhận / điểm đến, trạng thái.
List<List<String>> handoverRows(
  List<ShipGroup> groups,
  List<ShipmentView> shipments,
  String Function(String statusCode) statusLabel,
) {
  String join(List<String?> parts) => parts.where((p) => (p ?? '').isNotEmpty).join(' · ');
  final rows = [
    for (final g in groups) ['Chưa có mã', g.id, join([g.recipientName, g.address]), statusLabel('packed')],
    for (final v in shipments)
      [
        v.code,
        v.groupId,
        join([v.recipientName, v.recipientPhone, v.recipientAddress]),
        statusLabel(v.status.code),
      ],
  ];
  return [
    for (var i = 0; i < rows.length; i++) ['${i + 1}', ...rows[i]],
  ];
}

Future<Uint8List> buildHandoverSlip({
  required List<List<String>> rows,
  required String queueLabel,
  required String preparedBy,
  required DateTime at,
}) async {
  final regular = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans-Bold.ttf'));
  final doc = pw.Document(theme: pw.ThemeData.withFont(base: regular, bold: bold));
  pw.Widget signature(String title) => pw.Expanded(
        child: pw.Column(children: [
          pw.Text(title, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
          pw.Text('(ký, ghi rõ họ tên)', style: const pw.TextStyle(fontSize: 8)),
          pw.SizedBox(height: 56),
        ]),
      );
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4.landscape,
    margin: const pw.EdgeInsets.all(28),
    footer: (context) => pw.Align(
      alignment: pw.Alignment.centerRight,
      child: pw.Text('Trang ${context.pageNumber}/${context.pagesCount}', style: const pw.TextStyle(fontSize: 8)),
    ),
    build: (_) => [
      pw.Text('PHIẾU BÀN GIAO VẬN CHUYỂN', style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
      pw.SizedBox(height: 4),
      pw.Text(
        'Hàng đợi: $queueLabel · ${rows.length} dòng · Lập lúc ${formatDateTime(at)} (${at.toLocal().year})'
        ' · Người lập: $preparedBy',
        style: const pw.TextStyle(fontSize: 9),
      ),
      pw.SizedBox(height: 10),
      pw.TableHelper.fromTextArray(
        headers: const ['STT', 'Mã vận đơn', 'Mã nhóm kiện', 'Người nhận / điểm đến', 'Trạng thái'],
        data: rows,
        headerStyle: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
        headerDecoration: const pw.BoxDecoration(color: PdfColors.grey300),
        cellStyle: const pw.TextStyle(fontSize: 8),
        cellAlignment: pw.Alignment.centerLeft,
        columnWidths: const {
          0: pw.FixedColumnWidth(28),
          1: pw.FlexColumnWidth(2),
          2: pw.FlexColumnWidth(2.4),
          3: pw.FlexColumnWidth(4),
          4: pw.FlexColumnWidth(1.4),
        },
      ),
      pw.SizedBox(height: 24),
      pw.Row(children: [signature('Người giao'), signature('Người nhận hàng')]),
    ],
  ));
  return doc.save();
}

Future<void> printHandoverSlip(
  BuildContext context, {
  required List<List<String>> rows,
  required String queueLabel,
  required String preparedBy,
}) async {
  if (rows.isEmpty) {
    showToast(context, 'Không có dòng nào để in.');
    return;
  }
  await runAction(context, () async {
    final bytes =
        await buildHandoverSlip(rows: rows, queueLabel: queueLabel, preparedBy: preparedBy, at: DateTime.now());
    await Printing.layoutPdf(name: 'phieu-ban-giao', onLayout: (_) async => bytes);
  });
}
