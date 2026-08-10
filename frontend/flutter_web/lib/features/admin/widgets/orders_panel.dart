import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_controller.dart';
import '../../orders/widgets/receipt_dialog.dart';

/// Admin panel for viewing and progressing orders for the currently
/// selected store. Previously orders were completely invisible to staff
/// after checkout - the `status` column existed on day one but nothing
/// ever wrote to it.
class OrdersPanel extends StatefulWidget {
  final Map<String, dynamic>? selectedStore;

  const OrdersPanel({super.key, required this.selectedStore});

  @override
  State<OrdersPanel> createState() => _OrdersPanelState();
}

class _OrdersPanelState extends State<OrdersPanel> {
  static const _statusFlow = [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'completed',
  ];

  List<Map<String, dynamic>> _orders = [];
  bool _loading = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  @override
  void didUpdateWidget(covariant OrdersPanel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.selectedStore?['id'] != widget.selectedStore?['id']) {
      _loadOrders();
    }
  }

  AuthController get _auth => context.read<AuthController>();

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;

    setState(() {
      _message = message;
      _messageIsError = isError;
    });
  }

  Future<void> _loadOrders() async {
    final storeId = widget.selectedStore?['id'];

    if (storeId == null) {
      setState(() => _orders = []);
      return;
    }

    setState(() => _loading = true);

    try {
      final response =
          await _auth.authorizedRequest('GET', '/orders/store/$storeId');

      if (response.statusCode != 200) {
        _showMessage('Failed to load orders: ${response.body}', isError: true);
        setState(() => _loading = false);
        return;
      }

      final decoded = jsonDecode(response.body);
      final loaded = decoded is Map && decoded['orders'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['orders'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      setState(() {
        _orders = loaded;
        _loading = false;
      });
    } catch (error) {
      setState(() => _loading = false);
      _showMessage('Network error while loading orders: $error', isError: true);
    }
  }

  Future<void> _updateStatus(int orderId, String newStatus) async {
    try {
      final response = await _auth.authorizedRequest(
        'PATCH',
        '/orders/$orderId/status',
        body: {'status': newStatus},
      );

      if (response.statusCode != 200) {
        final decoded = jsonDecode(response.body);
        final message = decoded is Map && decoded['message'] != null
            ? decoded['message'].toString()
            : 'Failed to update order status.';

        _showMessage(message, isError: true);
        return;
      }

      await _loadOrders();
    } catch (error) {
      _showMessage('Network error: $error', isError: true);
    }
  }

  String? _nextStatus(String current) {
    final index = _statusFlow.indexOf(current);

    if (index == -1 || index == _statusFlow.length - 1) return null;

    return _statusFlow[index + 1];
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange;
      case 'confirmed':
        return Colors.blue;
      case 'preparing':
        return Colors.purple;
      case 'ready':
        return Colors.teal;
      case 'completed':
        return Colors.green;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Orders',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _loadOrders,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh orders',
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_message != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: _messageIsError
                      ? const Color(0xFFFFEDEA)
                      : const Color(0xFFE8F6EC),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _message!,
                  style: TextStyle(
                    color: _messageIsError
                        ? Colors.redAccent
                        : Colors.green.shade800,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            if (widget.selectedStore == null)
              _buildEmptyState('Select a store to view its orders.')
            else if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_orders.isEmpty)
              _buildEmptyState('No orders yet for this store.')
            else
              Column(children: _orders.map(_buildOrderTile).toList()),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFF625D5A)),
      ),
    );
  }

  Widget _buildOrderTile(Map<String, dynamic> order) {
    final orderId = int.tryParse(order['id'].toString());
    final status = order['status']?.toString() ?? 'pending';
    final customerName = order['customer_name']?.toString() ?? 'Guest';
    final total = double.tryParse(order['total'].toString()) ?? 0;
    final items =
        order['items'] is List ? List.from(order['items']) : const [];
    final fulfillmentType =
        order['fulfillment_type']?.toString() ?? 'pickup';
    final discount =
        double.tryParse(order['discount_amount']?.toString() ?? '0') ?? 0;
    final nextStatus = _nextStatus(status);
    final isTerminal = status == 'completed' || status == 'cancelled';

    return Card(
      color: const Color(0xFFFAFAFA),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _statusColor(status).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    status.toUpperCase(),
                    style: TextStyle(
                      color: _statusColor(status),
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '#$orderId · $customerName',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '\$${total.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: Colors.deepOrange,
                      ),
                    ),
                    if (discount > 0)
                      Text(
                        '-\$${discount.toStringAsFixed(2)}'
                        '${order['coupon_code'] != null ? ' ${order['coupon_code']}' : ''}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Colors.green,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 6),
            // Delivery is no longer an offered fulfillment choice, but this
            // history view can still show an order placed while it was -
            // mislabelling it as pickup would misrepresent what actually
            // happened, so the case stays here even though it's gone from
            // checkout.
            Row(
              children: [
                Icon(
                  switch (fulfillmentType) {
                    'delivery' => Icons.delivery_dining,
                    'dine_in' => Icons.table_restaurant,
                    _ => Icons.storefront,
                  },
                  size: 14,
                  color: const Color(0xFF625D5A),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    switch (fulfillmentType) {
                      'delivery' =>
                        'Delivery — ${order['delivery_address'] ?? 'no address'}',
                      'dine_in' =>
                        'Dine in — table ${order['table_number'] ?? '?'}',
                      _ => 'Pickup',
                    },
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF625D5A),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Text(
                  '${item['product_name']} x${item['quantity']}'
                  '${item['modifiers'] is List && (item['modifiers'] as List).isNotEmpty ? '  ·  ${(item['modifiers'] as List).map((m) => m['option_name']).join(', ')}' : ''}'
                  '${item['notes'] != null ? '  ·  ${item['notes']}' : ''}',
                  style: TextStyle(
                    fontSize: 12,
                    color: const Color(0xFF625D5A),
                    fontStyle: item['notes'] != null
                        ? FontStyle.italic
                        : FontStyle.normal,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (orderId != null)
                  TextButton.icon(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => ReceiptDialog(
                        auth: _auth,
                        orderId: orderId,
                        allowRefund: true,
                      ),
                    ),
                    icon: const Icon(Icons.receipt_long, size: 16),
                    label: const Text('Receipt'),
                  ),
                if (!isTerminal) ...[
                  TextButton(
                    onPressed: orderId == null
                        ? null
                        : () => _updateStatus(orderId, 'cancelled'),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(width: 8),
                ],
                if (nextStatus != null)
                  FilledButton(
                    onPressed: orderId == null
                        ? null
                        : () => _updateStatus(orderId, nextStatus),
                    child: Text('Mark $nextStatus'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
