import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/api/api_client.dart';
import '../core/auth/auth_controller.dart';
import '../core/notifications/browser_notifier.dart';
import '../core/payments/payment_config.dart';
import '../core/payments/tappay_sdk.dart';
import '../features/cart/cart_controller.dart';
import '../features/checkout/widgets/card_payment_fields.dart';
import '../features/checkout/widgets/pickup_time_selector.dart';
import '../features/menu/data/menu_repository.dart';
import '../models/product.dart';

class CheckoutPage extends StatefulWidget {
  /// The store's public code, not its numeric id - see HomePage's `code`
  /// field for why. Resolved to a numeric id internally on load.
  final String? code;

  /// Carried over from a scanned table QR code. When set, this is a
  /// dine-in order for that table rather than pickup.
  final int? tableNumber;

  /// Carried over from the landing page's "Ready by" selector, if the
  /// customer picked a slot there. Null means ASAP; still editable here.
  final String? initialReadyAt;

  const CheckoutPage({
    super.key,
    required this.code,
    this.tableNumber,
    this.initialReadyAt,
  });

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _notesController = TextEditingController();
  final _couponController = TextEditingController();

  bool _isSubmitting = false;
  String? _orderId;
  String? _confirmedReadyAt;
  String? _errorMessage;
  String _fulfillmentType = 'pickup';

  int? _storeId;
  List<Product> _products = [];
  bool _loadingProducts = true;
  String? _loadError;

  PaymentConfig _paymentConfig = const PaymentConfig(
    provider: 'manual',
    currency: 'TWD',
  );
  bool _cardFieldsReady = false;
  bool _paymentFailed = false;
  String? _paymentError;

  Map<String, dynamic>? _pickupSlots;
  bool _loadingPickupSlots = true;
  String? _selectedReadyAt;

  @override
  void initState() {
    super.initState();

    if (widget.tableNumber != null) {
      _fulfillmentType = 'dine_in';
    }

    _selectedReadyAt = widget.initialReadyAt;

    _loadPaymentConfig();

    // Pickup slots need the resolved numeric store id, so they wait for
    // _loadProducts to finish resolving the store from its code.
    _loadProducts().then((_) {
      if (!mounted) return;
      if (widget.tableNumber == null && _storeId != null) {
        _loadPickupSlots();
      }
    });
  }

  Future<void> _loadPickupSlots() async {
    final storeId = _storeId;
    if (storeId == null) return;

    setState(() => _loadingPickupSlots = true);

    try {
      final decoded =
          await ApiClient.getJson('/stores/$storeId/pickup-slots');

      if (!mounted) return;

      setState(() {
        _pickupSlots = Map<String, dynamic>.from(decoded);
        _loadingPickupSlots = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingPickupSlots = false);
    }
  }

  // Fetched once up front so the order summary can show the right payment
  // step immediately rather than flashing "Place Order" and then swapping to
  // a card form once the request lands.
  Future<void> _loadPaymentConfig() async {
    final config = await PaymentConfig.fetch();
    if (mounted) setState(() => _paymentConfig = config);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _notesController.dispose();
    _couponController.dispose();
    super.dispose();
  }

  // CheckoutPage resolves its own store and fetches its own menu instead of
  // receiving them from HomePage, so a direct load or hard refresh of
  // /checkout?code=... works on its own rather than depending on in-memory
  // navigation state that doesn't survive a reload.
  Future<void> _loadProducts() async {
    setState(() {
      _loadingProducts = true;
      _loadError = null;
    });

    final code = widget.code;

    if (code == null || code.isEmpty) {
      setState(() {
        _loadError = "This checkout link isn't valid.";
        _loadingProducts = false;
      });
      return;
    }

    try {
      final storeDecoded = await ApiClient.getJson('/stores/public/$code');
      final store = storeDecoded is Map && storeDecoded['store'] is Map
          ? Map<String, dynamic>.from(storeDecoded['store'])
          : null;
      final storeId =
          store == null ? null : int.tryParse(store['id'].toString());

      if (storeId == null) {
        if (!mounted) return;
        setState(() {
          _loadError = 'This restaurant is not available.';
          _loadingProducts = false;
        });
        return;
      }

      _storeId = storeId;

      final products = await MenuRepository.fetchProducts(storeId);

      if (!mounted) return;

      // The cart persists across reloads, so drop any entries that don't
      // belong to this store's current menu (e.g. a stale cart left over
      // from a different store).
      final validIds = products.map((p) => p.id).toSet();
      final cart = context.read<CartController>();
      final staleProductIds = cart.lines
          .map((line) => line.productId)
          .where((productId) => !validIds.contains(productId))
          .toSet();

      for (final productId in staleProductIds) {
        cart.removeProduct(productId);
      }

      setState(() {
        _products = products;
        _loadingProducts = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;

      setState(() {
        _loadError = error.message;
        _loadingProducts = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loadError = "Unable to load this store's menu. Please try again.";
        _loadingProducts = false;
      });
    }
  }

  double _subtotal(List<CartLine> lines) {
    double total = 0;
    for (final line in lines) {
      final product = _products.firstWhere((p) => p.id == line.productId);
      final unit = line.unitPrice > 0 ? line.unitPrice : product.price;
      total += unit * line.quantity;
    }
    return total;
  }

  int _itemCount(List<CartLine> lines) {
    return lines.fold(0, (sum, line) => sum + line.quantity);
  }

  Future<void> _submitOrder(List<CartLine> lines) async {
    if (!_formKey.currentState!.validate()) return;
    if (lines.isEmpty) {
      setState(() => _errorMessage = 'Your cart is empty.');
      return;
    }

    // Only reachable once _loadProducts resolved a store (the form isn't
    // shown otherwise - see the _loadingProducts/_loadError gate in build),
    // but a defensive check here costs nothing and avoids sending a null
    // storeId if that assumption is ever wrong.
    final storeId = _storeId;
    if (storeId == null) {
      setState(() => _errorMessage = 'This checkout link is no longer valid.');
      return;
    }

    if (_paymentConfig.isCard && !_cardFieldsReady) {
      setState(() => _errorMessage = 'The card form is still loading. One moment.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    // Read from context before the first await - context.read after an
    // await risks running against a disposed widget's context.
    final auth = context.read<AuthController>();

    // Tokenise the card BEFORE creating the order - a bad card should fail
    // here, not leave an order sitting unpaid because the charge came after.
    String? prime;

    if (_paymentConfig.isCard) {
      try {
        prime = await TapPaySdk.getPrime();
      } catch (error) {
        if (!mounted) return;
        setState(() {
          _isSubmitting = false;
          _errorMessage = 'Card error: ${error.toString()}';
        });
        return;
      }
    }

    final items = lines.map((line) {
      final product = _products.firstWhere((p) => p.id == line.productId);
      final unit = line.unitPrice > 0 ? line.unitPrice : product.price;

      return {
        'productId': product.id,
        'quantity': line.quantity,
        // Sent for the server's stale-cart comparison only; it prices the
        // line itself from the product and the chosen options.
        'price': unit,
        'notes': line.notes,
        'modifierOptionIds': line.modifierOptionIds,
      };
    }).toList();

    final body = {
      // No userId here - the server derives it from the auth token, so
      // there's nothing for a client to send or inflate.
      'storeId': storeId,
      'items': items,
      'total': _subtotal(lines),
      'customerName': _nameController.text.trim(),
      'customerPhone': _phoneController.text.trim(),
      'customerEmail': _emailController.text.trim().isEmpty
          ? null
          : _emailController.text.trim(),
      'notes': _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
      'fulfillmentType': _fulfillmentType,
      'tableNumber':
          _fulfillmentType == 'dine_in' ? widget.tableNumber : null,
      // Null means ASAP; the server re-validates whatever's sent against
      // its own prep-time and hours logic regardless (resolveDesiredReadyAt).
      'desiredReadyAt':
          _fulfillmentType == 'dine_in' ? null : _selectedReadyAt,
      // Only the code goes over the wire - the server resolves the actual
      // discount, so there's nothing here a client could inflate.
      'couponCode': _couponController.text.trim().isEmpty
          ? null
          : _couponController.text.trim(),
    };

    try {
      final response = await auth.authorizedRequest(
        'POST',
        '/orders',
        body: body,
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final newOrderId = data['order']?['id']?.toString();
        // From the server's own record, not the client's selection - that's
        // what was actually confirmed and stored.
        final confirmedReadyAt = data['order']?['desired_ready_at']?.toString();

        if (mounted) {
          context.read<CartController>().clear();
        }

        // The order exists at this point regardless of what happens next -
        // a card decline here must not make it look like nothing was
        // ordered. The success screen shows the payment outcome separately.
        bool paymentFailed = false;
        String? paymentError;

        if (prime != null && newOrderId != null) {
          try {
            final paymentResponse = await auth.authorizedRequest(
              'POST',
              '/orders/$newOrderId/payments',
              body: {
                'provider': 'tappay',
                'prime': prime,
                'cardholder': {
                  'name': _nameController.text.trim(),
                  'phone': _phoneController.text.trim(),
                  'email': _emailController.text.trim(),
                },
              },
            );

            if (paymentResponse.statusCode != 201) {
              paymentFailed = true;
              paymentError = _extractMessage(paymentResponse.body) ??
                  'The payment failed.';
            }
          } catch (_) {
            paymentFailed = true;
            paymentError = 'Could not reach the payment service.';
          }
        }

        if (!mounted) return;

        setState(() {
          _isSubmitting = false;
          _orderId = newOrderId;
          _confirmedReadyAt = confirmedReadyAt;
          _paymentFailed = paymentFailed;
          _paymentError = paymentError;
        });

        // Right after placing an order is the one moment "we'll notify you
        // when it's ready" is an obviously good reason to say yes - asking
        // on page load instead just trains people to reflexively deny it.
        unawaited(BrowserNotifier.requestPermissionIfNeeded());
      } else {
        // Surface the server's own message where it's actionable (an
        // expired or invalid coupon, a missing address) instead of a
        // generic failure the customer can't do anything about.
        setState(() {
          _isSubmitting = false;
          _errorMessage =
              _extractMessage(response.body) ??
                  'Failed to place order. Please try again.';
        });
      }
    } catch (e) {
      setState(() {
        _isSubmitting = false;
        _errorMessage = 'Network error: ${e.toString()}';
      });
    }
  }

  String? _extractMessage(String responseBody) {
    try {
      final decoded = jsonDecode(responseBody);
      if (decoded is Map && decoded['message'] != null) {
        return decoded['message'].toString();
      }
    } catch (_) {
      // Not JSON, or no message field - caller falls back to a generic one.
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    if (_orderId != null) {
      return _OrderSuccessSection(
        orderId: _orderId!,
        confirmedReadyAt: _confirmedReadyAt,
        paymentFailed: _paymentFailed,
        paymentError: _paymentError,
      );
    }

    if (_loadingProducts) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_loadError != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_loadError!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _loadProducts,
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final lines = context.watch<CartController>().lines;

    if (lines.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Your cart is empty.'),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => context.go('/'),
                  child: const Text('Back to Menu'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 900),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Contact Information',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 20),
                    _ContactField(
                      controller: _nameController,
                      label: 'Full Name',
                      icon: Icons.person,
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),
                    _ContactField(
                      controller: _phoneController,
                      label: 'Phone Number',
                      icon: Icons.phone,
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),
                    _ContactField(
                      controller: _emailController,
                      label: 'Email (optional)',
                      icon: Icons.email,
                      keyboardType: TextInputType.emailAddress,
                    ),
                    const SizedBox(height: 16),
                    _ContactField(
                      controller: _notesController,
                      label: 'Order Notes (optional)',
                      icon: Icons.note_alt,
                      maxLines: 3,
                    ),
                    const SizedBox(height: 28),
                    if (widget.tableNumber != null) ...[
                      // Dine-in: the table came from the scanned QR code, so
                      // there's no fulfillment choice to make here.
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF5EF),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.table_restaurant,
                                color: Colors.deepOrange),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Dine in — table ${widget.tableNumber}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ] else ...[
                      // Only fulfillment option outside the table-QR flow -
                      // nothing to choose, so no picker is shown.
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF5EF),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.storefront, color: Colors.deepOrange),
                            SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Pickup — we\'ll have it ready for you at the counter.',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (widget.tableNumber == null) ...[
                      const SizedBox(height: 20),
                      PickupTimeSelector(
                        pickupSlots: _pickupSlots,
                        loading: _loadingPickupSlots,
                        selectedReadyAt: _selectedReadyAt,
                        onSelect: (value) =>
                            setState(() => _selectedReadyAt = value),
                      ),
                    ],
                    const SizedBox(height: 28),
                    const Text(
                      'Order Summary',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 16),
                    _OrderSummary(
                      lines: lines,
                      products: _products,
                      itemCount: _itemCount(lines),
                      subtotal: _subtotal(lines),
                    ),
                    const SizedBox(height: 20),
                    _ContactField(
                      controller: _couponController,
                      label: 'Promo code (optional)',
                      icon: Icons.local_offer_outlined,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Any discount is applied and shown on your confirmed '
                      'order.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF77716D),
                      ),
                    ),
                    if (_paymentConfig.isCard) ...[
                      const SizedBox(height: 28),
                      const Text(
                        'Payment',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 16),
                      CardPaymentFields(
                        appId: _paymentConfig.appId!,
                        appKey: _paymentConfig.appKey!,
                        env: _paymentConfig.env!,
                        onReady: () {
                          if (mounted) setState(() => _cardFieldsReady = true);
                        },
                      ),
                    ],
                    const SizedBox(height: 24),
                    if (_errorMessage != null) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFDEDED),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(
                            color: Color(0xFFB91C1C),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                        onPressed: (_isSubmitting ||
                                (_paymentConfig.isCard && !_cardFieldsReady))
                            ? null
                            : () => _submitOrder(lines),
                        icon: _isSubmitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.check),
                        label: Text(
                          _isSubmitting
                              ? (_paymentConfig.isCard
                                  ? 'Processing payment...'
                                  : 'Placing order...')
                              : (_paymentConfig.isCard
                                  ? 'Pay & Place Order'
                                  : 'Place Order'),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ContactField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType keyboardType;
  final int maxLines;
  final String? Function(String?)? validator;

  const _ContactField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType = TextInputType.text,
    this.maxLines = 1,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      validator: validator,
    );
  }
}

class _OrderSummary extends StatelessWidget {
  final List<CartLine> lines;
  final List<Product> products;
  final int itemCount;
  final double subtotal;

  const _OrderSummary({
    required this.lines,
    required this.products,
    required this.itemCount,
    required this.subtotal,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF5EF),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 24,
            runSpacing: 12,
            children: [
              _SummaryStat(
                label: 'Total items',
                value: '$itemCount',
              ),
              _SummaryStat(
                label: 'Subtotal',
                value: '\$${subtotal.toStringAsFixed(2)}',
              ),
            ],
          ),
          const SizedBox(height: 18),
          ...lines.map((line) {
            final product =
                products.firstWhere((p) => p.id == line.productId);
            final unit = line.unitPrice > 0 ? line.unitPrice : product.price;
            final lineTotal = unit * line.quantity;

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${product.name} x${line.quantity}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                        if (line.notes != null)
                          Text(
                            line.notes!,
                            style: const TextStyle(
                              fontSize: 13,
                              fontStyle: FontStyle.italic,
                              color: Color(0xFF625D5A),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Text(
                    '\$${lineTotal.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: Colors.deepOrange,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryStat({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 140,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Colors.deepOrange,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF625D5A),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderSuccessSection extends StatelessWidget {
  final String orderId;
  final String? confirmedReadyAt;
  final bool paymentFailed;
  final String? paymentError;

  const _OrderSuccessSection({
    required this.orderId,
    this.confirmedReadyAt,
    this.paymentFailed = false,
    this.paymentError,
  });

  String _formatReadyAt(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso;
    final local = parsed.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Order Confirmed'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: Card(
              color: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      paymentFailed ? Icons.error_outline : Icons.check_circle,
                      color: paymentFailed ? Colors.orange : Colors.green,
                      size: 64,
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Order Placed Successfully',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Your order number is #$orderId',
                      style: const TextStyle(
                        fontSize: 16,
                        color: Color(0xFF625D5A),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      confirmedReadyAt != null
                          ? 'Ready by ${_formatReadyAt(confirmedReadyAt!)}'
                          : "We'll have it ready as soon as possible.",
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.deepOrange,
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (paymentFailed) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFF4E5),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Your order was placed, but the card payment '
                              'did not go through.',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                            if (paymentError != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                paymentError!,
                                style: const TextStyle(fontSize: 13),
                              ),
                            ],
                            const SizedBox(height: 4),
                            const Text(
                              'Please pay at pickup, or contact the store.',
                              style: TextStyle(fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                    ] else
                      const Text(
                        'Thank you for ordering with Orange Bistro. We will prepare your items shortly.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16,
                          height: 1.6,
                          color: Color(0xFF625D5A),
                        ),
                      ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () => context.go('/'),
                      icon: const Icon(Icons.home),
                      label: const Text('Back to Home'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
