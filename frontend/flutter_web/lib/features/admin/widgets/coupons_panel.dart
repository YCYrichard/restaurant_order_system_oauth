import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_controller.dart';

/// Admin panel for promo codes. Discounts are always resolved server-side
/// at checkout from the code alone, so nothing here affects what a customer
/// can claim beyond defining the coupon itself.
class CouponsPanel extends StatefulWidget {
  final Map<String, dynamic>? selectedStore;

  const CouponsPanel({super.key, required this.selectedStore});

  @override
  State<CouponsPanel> createState() => _CouponsPanelState();
}

class _CouponsPanelState extends State<CouponsPanel> {
  List<Map<String, dynamic>> _coupons = [];
  bool _loading = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _loadCoupons();
  }

  @override
  void didUpdateWidget(covariant CouponsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.selectedStore?['id'] != widget.selectedStore?['id']) {
      _loadCoupons();
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

  Future<void> _loadCoupons() async {
    final storeId = widget.selectedStore?['id'];

    if (storeId == null) {
      setState(() => _coupons = []);
      return;
    }

    setState(() => _loading = true);

    try {
      final response = await _auth.authorizedRequest(
        'GET',
        '/api/v1/coupons/store/$storeId',
      );

      if (response.statusCode != 200) {
        _showMessage('Failed to load coupons: ${response.body}',
            isError: true);
        setState(() => _loading = false);
        return;
      }

      final decoded = jsonDecode(response.body);
      final loaded = decoded is Map && decoded['coupons'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['coupons'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      setState(() {
        _coupons = loaded;
        _loading = false;
      });
    } catch (error) {
      setState(() => _loading = false);
      _showMessage('Network error while loading coupons: $error',
          isError: true);
    }
  }

  Future<void> _setActive(int couponId, bool isActive) async {
    try {
      final response = await _auth.authorizedRequest(
        'PATCH',
        '/api/v1/coupons/$couponId/status',
        body: {'isActive': isActive},
      );

      if (response.statusCode != 200) {
        _showMessage('Failed to update coupon.', isError: true);
        return;
      }

      await _loadCoupons();
    } catch (error) {
      _showMessage('Network error: $error', isError: true);
    }
  }

  Future<void> _deleteCoupon(int couponId, String code) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete Coupon'),
        content: Text(
          'Delete "$code"? Past orders keep the discount they already '
          'received, but the code will stop working.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final response = await _auth.authorizedRequest(
        'DELETE',
        '/api/v1/coupons/$couponId',
      );

      if (response.statusCode != 200) {
        _showMessage('Failed to delete coupon.', isError: true);
        return;
      }

      await _loadCoupons();
    } catch (error) {
      _showMessage('Network error: $error', isError: true);
    }
  }

  Future<void> _showCreateDialog() async {
    final codeController = TextEditingController();
    final valueController = TextEditingController();
    final minTotalController = TextEditingController();
    final maxRedemptionsController = TextEditingController();
    var discountType = 'percent';
    var storeScoped = widget.selectedStore != null;

    final created = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Create Coupon'),
              content: SizedBox(
                width: 460,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: codeController,
                        autofocus: true,
                        textCapitalization: TextCapitalization.characters,
                        decoration: const InputDecoration(
                          labelText: 'Code (e.g. WELCOME10)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: discountType,
                        decoration: const InputDecoration(
                          labelText: 'Discount type',
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'percent',
                            child: Text('Percent off'),
                          ),
                          DropdownMenuItem(
                            value: 'fixed',
                            child: Text('Fixed amount off'),
                          ),
                        ],
                        onChanged: (value) => setDialogState(
                          () => discountType = value ?? 'percent',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: valueController,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: discountType == 'percent'
                              ? 'Percent off (1-100)'
                              : 'Amount off',
                          border: const OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: minTotalController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Minimum order total (optional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: maxRedemptionsController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Max total redemptions (optional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      if (widget.selectedStore != null) ...[
                        const SizedBox(height: 8),
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          value: storeScoped,
                          onChanged: (value) => setDialogState(
                            () => storeScoped = value ?? false,
                          ),
                          title: Text(
                            'Limit to ${widget.selectedStore!['name']}',
                          ),
                          subtitle: const Text(
                            'Otherwise the code works at every store.',
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () async {
                    final body = <String, dynamic>{
                      'code': codeController.text.trim(),
                      'discountType': discountType,
                      'discountValue':
                          double.tryParse(valueController.text.trim()) ?? 0,
                      'minOrderTotal':
                          double.tryParse(minTotalController.text.trim()) ?? 0,
                      if (maxRedemptionsController.text.trim().isNotEmpty)
                        'maxRedemptions':
                            int.tryParse(maxRedemptionsController.text.trim()),
                      if (storeScoped && widget.selectedStore != null)
                        'storeId': int.tryParse(
                          widget.selectedStore!['id'].toString(),
                        ),
                    };

                    final response = await _auth.authorizedRequest(
                      'POST',
                      '/api/v1/coupons',
                      body: body,
                    );

                    if (!dialogContext.mounted) return;

                    if (response.statusCode != 201) {
                      final decoded = jsonDecode(response.body);
                      final message = decoded is Map &&
                              decoded['message'] != null
                          ? decoded['message'].toString()
                          : 'Failed to create coupon.';

                      ScaffoldMessenger.of(dialogContext).showSnackBar(
                        SnackBar(content: Text(message)),
                      );
                      return;
                    }

                    Navigator.of(dialogContext).pop(true);
                  },
                  child: const Text('Create'),
                ),
              ],
            );
          },
        );
      },
    );

    if (created == true) {
      await _loadCoupons();
      _showMessage('Coupon created.');
    }
  }

  String _describe(Map<String, dynamic> coupon) {
    final type = coupon['discount_type']?.toString();
    final value = double.tryParse(coupon['discount_value'].toString()) ?? 0;
    final minTotal =
        double.tryParse(coupon['min_order_total'].toString()) ?? 0;
    final maxRedemptions = coupon['max_redemptions'];
    final used = coupon['redemption_count'] ?? 0;

    final parts = <String>[
      type == 'percent'
          ? '${value.toStringAsFixed(0)}% off'
          : '\$${value.toStringAsFixed(2)} off',
      if (minTotal > 0) 'min \$${minTotal.toStringAsFixed(2)}',
      if (coupon['store_id'] == null) 'all stores',
      maxRedemptions == null ? 'used $used' : 'used $used/$maxRedemptions',
    ];

    return parts.join(' · ');
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
                    'Promo Codes',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _loadCoupons,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh coupons',
                ),
                IconButton(
                  onPressed: _showCreateDialog,
                  icon: const Icon(Icons.add),
                  tooltip: 'Create coupon',
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
              _buildEmptyState('Select a store to manage its promo codes.')
            else if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_coupons.isEmpty)
              _buildEmptyState('No promo codes yet.')
            else
              Column(children: _coupons.map(_buildCouponTile).toList()),
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

  Widget _buildCouponTile(Map<String, dynamic> coupon) {
    final couponId = int.tryParse(coupon['id'].toString());
    final code = coupon['code']?.toString() ?? '';
    final isActive = coupon['is_active'] == 1 || coupon['is_active'] == true;

    return Card(
      color: const Color(0xFFFAFAFA),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Icon(
              Icons.local_offer_outlined,
              color: isActive ? Colors.deepOrange : Colors.grey,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    code,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      decoration:
                          isActive ? null : TextDecoration.lineThrough,
                    ),
                  ),
                  Text(
                    _describe(coupon),
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF625D5A),
                    ),
                  ),
                ],
              ),
            ),
            if (couponId != null) ...[
              Switch(
                value: isActive,
                onChanged: (value) => _setActive(couponId, value),
              ),
              IconButton(
                onPressed: () => _deleteCoupon(couponId, code),
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Delete coupon',
              ),
            ],
          ],
        ),
      ),
    );
  }
}
