import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:web/web.dart' as web;

/// Generates the storefront QR/link (the only way a customer reaches this
/// store - there is no in-app picker) and a printable QR per table. Neither
/// has a server-side entity - both are just encoded links to
/// /store/:storeId(?table=N) - so this panel needs no API of its own.
class TableQrPanel extends StatefulWidget {
  final Map<String, dynamic>? selectedStore;

  const TableQrPanel({super.key, required this.selectedStore});

  @override
  State<TableQrPanel> createState() => _TableQrPanelState();
}

class _TableQrPanelState extends State<TableQrPanel> {
  final _tableController = TextEditingController(text: '1');

  int _tableNumber = 1;

  @override
  void dispose() {
    _tableController.dispose();
    super.dispose();
  }

  String get _origin => web.window.location.origin;

  String _storeUrlFor(int storeId) => '$_origin/#/store/$storeId';

  String _urlFor(int storeId, int tableNumber) =>
      '${_storeUrlFor(storeId)}?table=$tableNumber';

  @override
  Widget build(BuildContext context) {
    final storeId = widget.selectedStore == null
        ? null
        : int.tryParse(widget.selectedStore!['id'].toString());

    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Ordering QR Codes',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'This is how customers find this store - there is no in-app '
              'restaurant picker, so print or share one of the links below.',
              style: TextStyle(color: Color(0xFF625D5A), height: 1.4),
            ),
            const SizedBox(height: 16),
            if (storeId == null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFFFAFAFA),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'Select a store to generate its QR codes.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF625D5A)),
                ),
              )
            else ...[
              const Text(
                'Storefront link',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 4),
              const Text(
                'The main link for this store - hand it out directly, or '
                'post the QR code at the counter or in a window.',
                style: TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
              ),
              const SizedBox(height: 16),
              Center(
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE6E1DD)),
                      ),
                      child: QrImageView(
                        data: _storeUrlFor(storeId),
                        size: 200,
                        backgroundColor: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SelectableText(
                      _storeUrlFor(storeId),
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF77716D),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              const Divider(),
              const SizedBox(height: 12),
              const Text(
                'Table QR codes',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 4),
              const Text(
                'Print one per table. Scanning it opens this store\'s menu '
                'with the table already set for a dine-in order.',
                style: TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  SizedBox(
                    width: 160,
                    child: TextField(
                      controller: _tableController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Table number',
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (value) {
                        final parsed = int.tryParse(value.trim());
                        if (parsed != null && parsed > 0) {
                          setState(() => _tableNumber = parsed);
                        }
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Center(
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE6E1DD)),
                      ),
                      child: QrImageView(
                        data: _urlFor(storeId, _tableNumber),
                        size: 200,
                        backgroundColor: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Table $_tableNumber',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SelectableText(
                      _urlFor(storeId, _tableNumber),
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF77716D),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
