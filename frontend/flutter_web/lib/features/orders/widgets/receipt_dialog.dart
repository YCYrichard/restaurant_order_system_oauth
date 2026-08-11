import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

import '../../../core/auth/auth_controller.dart';

/// Itemised receipt with the tax breakdown, readable by the ordering
/// customer or the store's staff. Staff additionally get a refund action.
///
/// Printing goes through the browser rather than a receipt printer -
/// hardware integration is a separate concern.
class ReceiptDialog extends StatefulWidget {
  final AuthController auth;
  final int orderId;
  final bool allowRefund;

  const ReceiptDialog({
    super.key,
    required this.auth,
    required this.orderId,
    this.allowRefund = false,
  });

  @override
  State<ReceiptDialog> createState() => _ReceiptDialogState();
}

class _ReceiptDialogState extends State<ReceiptDialog> {
  Map<String, dynamic>? _receipt;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.auth.authorizedRequest(
        'GET',
        '/orders/${widget.orderId}/receipt',
      );

      if (response.statusCode != 200) {
        setState(() {
          _error = 'Could not load this receipt.';
          _loading = false;
        });
        return;
      }

      if (!mounted) return;

      setState(() {
        _receipt = Map<String, dynamic>.from(jsonDecode(response.body));
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Network error loading the receipt.';
        _loading = false;
      });
    }
  }

  Future<void> _refund() async {
    final amountController = TextEditingController();
    final reasonController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Record a refund'),
        content: SizedBox(
          width: 380,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: amountController,
                autofocus: true,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Amount',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonController,
                decoration: const InputDecoration(
                  labelText: 'Reason',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'This records the refund against the order. No payment '
                'provider is connected yet, so no money moves automatically.',
                style: TextStyle(fontSize: 12, color: Color(0xFF77716D)),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Record'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final response = await widget.auth.authorizedRequest(
      'POST',
      '/orders/${widget.orderId}/refunds',
      body: {
        'amount': double.tryParse(amountController.text.trim()) ?? 0,
        'reason': reasonController.text.trim(),
      },
    );

    if (!mounted) return;

    if (response.statusCode != 201) {
      final decoded = jsonDecode(response.body);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            decoded is Map && decoded['message'] != null
                ? decoded['message'].toString()
                : 'Refund failed.',
          ),
        ),
      );
      return;
    }

    await _load();
  }

  Future<void> _issueEinvoice() async {
    final numberController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Record the invoice number'),
        content: SizedBox(
          width: 380,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: numberController,
                autofocus: true,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Invoice number (e.g. AB12345678)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'This records a number already issued through your own '
                'MOF-registered invoicing system - nothing is transmitted '
                'to the government from here.',
                style: TextStyle(fontSize: 12, color: Color(0xFF77716D)),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Record'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final response = await widget.auth.authorizedRequest(
      'PATCH',
      '/orders/${widget.orderId}/einvoice',
      body: {'einvoiceNumber': numberController.text.trim()},
    );

    if (!mounted) return;

    if (response.statusCode != 200) {
      final decoded = jsonDecode(response.body);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            decoded is Map && decoded['message'] != null
                ? decoded['message'].toString()
                : 'Could not record the invoice number.',
          ),
        ),
      );
      return;
    }

    await _load();
  }

  Future<void> _voidEinvoice() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Void this invoice?'),
        content: const Text(
          'This only clears the status on this order - if the invoice was '
          'already reported through your real invoicing system, void it '
          'there too (作廢), following its own process.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Void'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final response = await widget.auth.authorizedRequest(
      'POST',
      '/orders/${widget.orderId}/einvoice/void',
    );

    if (!mounted) return;

    if (response.statusCode != 200) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not void the invoice.')),
      );
      return;
    }

    await _load();
  }

  void _print() => web.window.print();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Receipt · Order #${widget.orderId}'),
      content: SizedBox(
        width: 420,
        child: _loading
            ? const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            : _error != null
                ? Text(_error!)
                : SingleChildScrollView(child: _buildBody()),
      ),
      actions: [
        if (widget.allowRefund && _receipt != null) ...[
          if (_receipt!['order']['einvoice_status'] == 'pending')
            TextButton(
              onPressed: _issueEinvoice,
              child: const Text('Issue Invoice'),
            ),
          if (_receipt!['order']['einvoice_status'] == 'issued')
            TextButton(
              onPressed: _voidEinvoice,
              child: const Text('Void Invoice'),
            ),
          TextButton(onPressed: _refund, child: const Text('Refund')),
        ],
        if (_receipt != null)
          TextButton(onPressed: _print, child: const Text('Print')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }

  Widget _buildBody() {
    final order = Map<String, dynamic>.from(_receipt!['order']);
    final totals = Map<String, dynamic>.from(_receipt!['totals']);
    final refunds = _receipt!['refunds'] is List
        ? List.from(_receipt!['refunds'])
        : const [];
    final items = order['items'] is List ? List.from(order['items']) : const [];

    String money(Object? value) =>
        '\$${(double.tryParse('$value') ?? 0).toStringAsFixed(2)}';

    String formatLocalTime(String iso) {
      final parsed = DateTime.tryParse(iso);
      if (parsed == null) return iso;
      final local = parsed.toLocal();
      return '${local.hour.toString().padLeft(2, '0')}:'
          '${local.minute.toString().padLeft(2, '0')}';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          order['store_name']?.toString() ?? 'Store',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
        Text(
          '${order['created_at']?.toString().split('T').first ?? ''} · '
          '${order['fulfillment_type']}'
          '${order['table_number'] != null ? ' · table ${order['table_number']}' : ''}',
          style: const TextStyle(fontSize: 12, color: Color(0xFF77716D)),
        ),
        if (order['desired_ready_at'] != null)
          Text(
            'Ready by ${formatLocalTime(order['desired_ready_at'].toString())}',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Colors.deepOrange,
            ),
          ),
        if (order['einvoice_status'] != null &&
            order['einvoice_status'] != 'not_applicable')
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              switch (order['einvoice_status']) {
                'issued' => 'Invoice ${order['einvoice_number']} issued',
                'void' => 'Invoice voided',
                _ => order['einvoice_donate'] == true
                    ? 'Invoice pending - donated to charity'
                    : order['einvoice_buyer_tax_id'] != null
                        ? 'Invoice pending - tax ID ${order['einvoice_buyer_tax_id']}'
                        : 'Invoice pending',
              },
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: order['einvoice_status'] == 'issued'
                    ? Colors.green.shade800
                    : Colors.deepOrange,
              ),
            ),
          ),
        const Divider(height: 20),
        ...items.map((item) {
          final mods = item['modifiers'] is List
              ? List.from(item['modifiers'])
              : const [];

          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('${item['quantity']}× ${item['product_name']}'),
                    ),
                    Text(money(
                      (double.tryParse('${item['price']}') ?? 0) *
                          (int.tryParse('${item['quantity']}') ?? 0),
                    )),
                  ],
                ),
                ...mods.map(
                  (m) => Padding(
                    padding: const EdgeInsets.only(left: 16),
                    child: Text(
                      '${m['group_name']}: ${m['option_name']}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF77716D),
                      ),
                    ),
                  ),
                ),
                if (item['notes'] != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 16),
                    child: Text(
                      '${item['notes']}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        color: Color(0xFF77716D),
                      ),
                    ),
                  ),
              ],
            ),
          );
        }),
        const Divider(height: 20),
        _row('Subtotal', money(totals['subtotal'])),
        if ((double.tryParse('${totals['discount']}') ?? 0) > 0)
          _row(
            'Discount${order['coupon_code'] != null ? ' (${order['coupon_code']})' : ''}',
            '-${money(totals['discount'])}',
          ),
        if ((double.tryParse('${totals['tax']}') ?? 0) > 0)
          _row(
            // Saying which model applies matters: under the inclusive model
            // the tax is already part of the total, not added to it.
            'Tax ${((double.tryParse('${totals['taxRate']}') ?? 0) * 100).toStringAsFixed(0)}%'
            '${totals['taxInclusive'] == true ? ' (included)' : ''}',
            money(totals['tax']),
          ),
        const SizedBox(height: 4),
        _row('Total', money(totals['total']), bold: true),
        if (refunds.isNotEmpty) ...[
          const Divider(height: 20),
          ...refunds.map(
            (refund) => _row(
              'Refund${refund['reason'] != null ? ' · ${refund['reason']}' : ''}',
              '-${money(refund['amount'])}',
            ),
          ),
          _row('Net', money(totals['net']), bold: true),
        ],
      ],
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
    final style = TextStyle(
      fontWeight: bold ? FontWeight.w900 : FontWeight.normal,
      fontSize: bold ? 16 : 14,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: style),
        ],
      ),
    );
  }
}
