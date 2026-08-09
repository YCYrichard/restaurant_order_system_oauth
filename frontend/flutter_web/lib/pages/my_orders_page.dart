import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/auth/auth_controller.dart';

/// Customer-facing order history. Surfaces GET /orders/user/:userId, which
/// has existed and been auth-protected for a while but was never called by
/// any screen until now.
class MyOrdersPage extends StatefulWidget {
  const MyOrdersPage({super.key});

  @override
  State<MyOrdersPage> createState() => _MyOrdersPageState();
}

class _MyOrdersPageState extends State<MyOrdersPage> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    final auth = context.read<AuthController>();
    final userId = auth.userId;

    if (userId == null) {
      setState(() {
        _error = 'You need to be signed in to view your orders.';
        _loading = false;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response =
          await auth.authorizedRequest('GET', '/orders/user/$userId');

      if (response.statusCode != 200) {
        setState(() {
          _error = 'Failed to load your orders.';
          _loading = false;
        });
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

      if (!mounted) return;

      setState(() {
        _orders = loaded;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = 'Network error while loading your orders.';
        _loading = false;
      });
    }
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Orders'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          onPressed: () => context.go('/'),
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back',
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _loadOrders,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_loading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(48),
                      child: CircularProgressIndicator(),
                    ),
                  )
                else if (_error != null)
                  Center(
                    child: Column(
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _loadOrders,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                else if (_orders.isEmpty)
                  _buildEmptyState()
                else ...[
                  Text(
                    '${_orders.length} order${_orders.length == 1 ? '' : 's'}',
                    style: const TextStyle(
                      fontSize: 16,
                      color: Color(0xFF625D5A),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ..._orders.map(_buildOrderCard),
                ],
                const SizedBox(height: 24),
                // Guest checkout is supported (POST /orders needs no auth), so
                // orders placed while signed out have no user_id and can never
                // appear here - worth saying plainly rather than looking broken.
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF5EF),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Text(
                    'Only orders placed while signed in appear here. '
                    'Orders placed as a guest are not linked to your account.',
                    style: TextStyle(color: Color(0xFF625D5A), height: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          const Icon(Icons.receipt_long_outlined, size: 42, color: Colors.grey),
          const SizedBox(height: 12),
          const Text(
            "You haven't placed any orders yet.",
            style: TextStyle(color: Color(0xFF625D5A)),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => context.go('/'),
            icon: const Icon(Icons.restaurant_menu),
            label: const Text('Browse the menu'),
          ),
        ],
      ),
    );
  }

  Widget _buildOrderCard(Map<String, dynamic> order) {
    final orderId = order['id'];
    final status = order['status']?.toString() ?? 'pending';
    final storeName = order['store_name']?.toString() ?? 'Store';
    final total = double.tryParse(order['total'].toString()) ?? 0;
    final discount =
        double.tryParse(order['discount_amount']?.toString() ?? '0') ?? 0;
    final createdAt = order['created_at']?.toString();
    final items =
        order['items'] is List ? List.from(order['items']) : const [];

    return Card(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(18),
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
                    'Order #$orderId · $storeName',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '\$${total.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                        color: Colors.deepOrange,
                      ),
                    ),
                    if (discount > 0)
                      Text(
                        'saved \$${discount.toStringAsFixed(2)}'
                        '${order['coupon_code'] != null ? ' · ${order['coupon_code']}' : ''}',
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
            if (createdAt != null) ...[
              const SizedBox(height: 6),
              Text(
                createdAt.split('T').first,
                style: const TextStyle(fontSize: 12, color: Color(0xFF77716D)),
              ),
            ],
            const SizedBox(height: 12),
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${item['product_name']} x${item['quantity']}',
                        style: const TextStyle(color: Color(0xFF625D5A)),
                      ),
                    ),
                    Text(
                      '\$${(double.tryParse(item['price'].toString()) ?? 0) * (int.tryParse(item['quantity'].toString()) ?? 0)}',
                      style: const TextStyle(color: Color(0xFF625D5A)),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
