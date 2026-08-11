import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/api/response_message.dart';
import '../../../core/auth/auth_controller.dart';

/// Per-store loyalty/rewards configuration, plus a read-only list of the
/// store's top point holders. Config lives directly on the store record
/// (loyalty_enabled/loyalty_points_per_dollar/loyalty_point_value/
/// loyalty_stackable_with_coupons), saved through the same generic
/// PUT /stores/:storeId endpoint tax and prep-time already use - no
/// dedicated settings endpoint needed for it.
class LoyaltyPanel extends StatefulWidget {
  final Map<String, dynamic>? selectedStore;

  const LoyaltyPanel({super.key, required this.selectedStore});

  @override
  State<LoyaltyPanel> createState() => _LoyaltyPanelState();
}

class _LoyaltyPanelState extends State<LoyaltyPanel> {
  final _pointsPerDollarController = TextEditingController(text: '1.00');
  final _pointValueController = TextEditingController(text: '1.00');

  bool _enabled = false;
  bool _stackableWithCoupons = false;

  bool _saving = false;
  String? _message;
  bool _messageIsError = false;

  List<Map<String, dynamic>> _topHolders = [];
  bool _loadingHolders = false;

  @override
  void initState() {
    super.initState();
    _loadFromStore();
    _loadTopHolders();
  }

  @override
  void dispose() {
    _pointsPerDollarController.dispose();
    _pointValueController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant LoyaltyPanel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.selectedStore?['id'] != widget.selectedStore?['id']) {
      _loadFromStore();
      _loadTopHolders();
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

  // Config comes from the store record already loaded by the admin page -
  // same pattern store_hours_panel.dart uses for tax/prep time.
  void _loadFromStore() {
    final store = widget.selectedStore;

    final enabledRaw = store?['loyalty_enabled'];
    _enabled = enabledRaw == true || enabledRaw == 1 || enabledRaw == '1';

    final stackableRaw = store?['loyalty_stackable_with_coupons'];
    _stackableWithCoupons =
        stackableRaw == true || stackableRaw == 1 || stackableRaw == '1';

    final pointsPerDollar =
        double.tryParse('${store?['loyalty_points_per_dollar'] ?? 1}') ?? 1;
    _pointsPerDollarController.text = pointsPerDollar.toStringAsFixed(2);

    // Point value is stored as dollars-per-point (e.g. 0.01); shown here as
    // "points per dollar of discount" (100), which is how a restaurant
    // owner actually thinks about a reward ("100 points = $1 off").
    final pointValue =
        double.tryParse('${store?['loyalty_point_value'] ?? 0.01}') ?? 0.01;
    _pointsPerDiscountDollar = pointValue > 0 ? (1 / pointValue) : 100;
    _pointValueController.text = _pointsPerDiscountDollar.toStringAsFixed(0);
  }

  double _pointsPerDiscountDollar = 100;

  Future<void> _loadTopHolders() async {
    final storeId = widget.selectedStore?['id'];
    if (storeId == null) {
      setState(() => _topHolders = []);
      return;
    }

    setState(() => _loadingHolders = true);

    try {
      final response =
          await _auth.authorizedRequest('GET', '/api/v1/loyalty/store/$storeId/top-holders');

      if (!mounted) return;

      if (response.statusCode != 200) {
        setState(() {
          _topHolders = [];
          _loadingHolders = false;
        });
        return;
      }

      final decoded = jsonDecode(response.body);
      final holders = decoded is Map && decoded['holders'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['holders'] as List)
                  .whereType<Map>()
                  .map((h) => Map<String, dynamic>.from(h)),
            )
          : <Map<String, dynamic>>[];

      setState(() {
        _topHolders = holders;
        _loadingHolders = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _topHolders = [];
        _loadingHolders = false;
      });
    }
  }

  Future<void> _save() async {
    final store = widget.selectedStore;
    if (store == null) return;

    final pointsPerDollar = double.tryParse(_pointsPerDollarController.text.trim());
    final pointsPerDiscountDollar = double.tryParse(_pointValueController.text.trim());

    if (pointsPerDollar == null || pointsPerDollar <= 0 || pointsPerDollar > 100) {
      _showMessage('Points per dollar must be a number between 0 and 100.', isError: true);
      return;
    }

    if (pointsPerDiscountDollar == null || pointsPerDiscountDollar <= 0) {
      _showMessage('Points needed for \$1 off must be a positive number.', isError: true);
      return;
    }

    setState(() {
      _saving = true;
      _message = null;
    });

    try {
      final response = await _auth.authorizedRequest(
        'PUT',
        '/stores/${store['id']}',
        body: {
          'name': store['name'],
          'address': store['address'],
          'phone': store['phone'],
          'loyaltyEnabled': _enabled,
          'loyaltyPointsPerDollar': pointsPerDollar,
          'loyaltyPointValue': 1 / pointsPerDiscountDollar,
          'loyaltyStackableWithCoupons': _stackableWithCoupons,
        },
      );

      if (!mounted) return;

      if (response.statusCode == 200) {
        setState(() {
          _saving = false;
          _message = 'Loyalty settings saved.';
          _messageIsError = false;
        });
      } else {
        setState(() {
          _saving = false;
          _message = responseErrorMessage(response, 'Failed to save loyalty settings.');
          _messageIsError = true;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _message = networkErrorMessage();
        _messageIsError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.selectedStore;

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
              'Loyalty & Rewards',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'Customers earn points on completed orders and can apply them '
              'toward a future order at checkout, up to the order balance.',
              style: TextStyle(color: Color(0xFF625D5A), height: 1.4),
            ),
            const SizedBox(height: 16),
            if (store == null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFFFAFAFA),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'Select a store to configure its rewards program.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF625D5A)),
                ),
              )
            else ...[
              if (_message != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: _messageIsError
                        ? const Color(0xFFFFEDEA)
                        : const Color(0xFFE8F6EC),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _message!,
                    style: TextStyle(
                      color: _messageIsError ? Colors.redAccent : Colors.green.shade800,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Enable rewards for this store'),
                value: _enabled,
                onChanged: (value) => setState(() => _enabled = value),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 16,
                runSpacing: 16,
                children: [
                  SizedBox(
                    width: 220,
                    child: TextField(
                      controller: _pointsPerDollarController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Points earned per \$1 spent',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 220,
                    child: TextField(
                      controller: _pointValueController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Points needed for \$1 off',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Allow stacking with a promo code'),
                subtitle: const Text(
                  'If off, a customer can use a promo code or their points on an '
                  'order, not both.',
                ),
                value: _stackableWithCoupons,
                onChanged: (value) => setState(() => _stackableWithCoupons = value),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? 'Saving...' : 'Save Loyalty Settings'),
              ),
              const SizedBox(height: 28),
              const Divider(),
              const SizedBox(height: 12),
              const Text(
                'Top point holders',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 12),
              if (_loadingHolders)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(),
                  ),
                )
              else if (_topHolders.isEmpty)
                const Text(
                  'No customers have a points balance yet.',
                  style: TextStyle(color: Color(0xFF625D5A)),
                )
              else
                ..._topHolders.map((holder) {
                  final name = holder['name']?.toString();
                  final email = holder['email']?.toString();
                  final label = (name != null && name.isNotEmpty) ? name : (email ?? 'Customer');

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(label, overflow: TextOverflow.ellipsis),
                        ),
                        Text(
                          '${holder['balance']} pts',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  );
                }),
            ],
          ],
        ),
      ),
    );
  }
}
