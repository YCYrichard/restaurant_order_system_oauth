import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:web/web.dart' as web;

/// Generates a printable QR code per table. Tables have no server-side
/// entity - a QR is just an encoded link to /store/:storeId?table=N - so
/// this panel needs no API of its own.
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

  String _urlFor(int storeId, int tableNumber) =>
      '$_origin/#/store/$storeId?table=$tableNumber';

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
              'Table QR Codes',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'Print one per table. Scanning it opens this store\'s menu with '
              'the table already set, and no sign-in is required to order.',
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
                  'Select a store to generate its table QR codes.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF625D5A)),
                ),
              )
            else ...[
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
