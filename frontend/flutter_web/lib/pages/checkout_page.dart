import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import '../core/api/api_client.dart';
import '../core/auth/auth_controller.dart';
import '../core/constants/app_config.dart';
import '../features/cart/cart_controller.dart';
import '../features/menu/data/menu_repository.dart';
import '../models/product.dart';

class CheckoutPage extends StatefulWidget {
  final int storeId;

  /// Carried over from a scanned table QR code. When set, this is a
  /// dine-in order for that table and the pickup/delivery choice doesn't
  /// apply.
  final int? tableNumber;

  const CheckoutPage({
    super.key,
    required this.storeId,
    this.tableNumber,
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
  final _addressController = TextEditingController();
  final _couponController = TextEditingController();

  bool _isSubmitting = false;
  String? _orderId;
  String? _errorMessage;
  String _fulfillmentType = 'pickup';

  List<Product> _products = [];
  bool _loadingProducts = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();

    if (widget.tableNumber != null) {
      _fulfillmentType = 'dine_in';
    }

    _loadProducts();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _notesController.dispose();
    _addressController.dispose();
    _couponController.dispose();
    super.dispose();
  }

  // CheckoutPage fetches its own menu instead of receiving it from
  // HomePage, so a direct load or hard refresh of /checkout?storeId=N
  // works on its own rather than depending on in-memory navigation state
  // that doesn't survive a reload.
  Future<void> _loadProducts() async {
    setState(() {
      _loadingProducts = true;
      _loadError = null;
    });

    try {
      final products = await MenuRepository.fetchProducts(widget.storeId);

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

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final userId = context.read<AuthController>().userId;
    final storeId = widget.storeId;

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
      'userId': userId,
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
      'deliveryAddress': _fulfillmentType == 'delivery'
          ? _addressController.text.trim()
          : null,
      'tableNumber':
          _fulfillmentType == 'dine_in' ? widget.tableNumber : null,
      // Only the code goes over the wire - the server resolves the actual
      // discount, so there's nothing here a client could inflate.
      'couponCode': _couponController.text.trim().isEmpty
          ? null
          : _couponController.text.trim(),
    };

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/orders'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final data = jsonDecode(response.body);

        if (mounted) {
          context.read<CartController>().clear();
        }

        setState(() {
          _isSubmitting = false;
          _orderId = data['order']?['id']?.toString();
        });
      } else {
        // Surface the server's own message where it's actionable (an
        // expired or invalid coupon, a missing address) instead of a
        // generic failure the customer can't do anything about.
        String message = 'Failed to place order. Please try again.';

        try {
          final decoded = jsonDecode(response.body);
          if (decoded is Map && decoded['message'] != null) {
            message = decoded['message'].toString();
          }
        } catch (_) {
          // Keep the generic message.
        }

        setState(() {
          _isSubmitting = false;
          _errorMessage = message;
        });
      }
    } catch (e) {
      setState(() {
        _isSubmitting = false;
        _errorMessage = 'Network error: ${e.toString()}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_orderId != null) {
      return _OrderSuccessSection(orderId: _orderId!);
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
                      const Text(
                        'How would you like your order?',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 16),
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(
                            value: 'pickup',
                            label: Text('Pickup'),
                            icon: Icon(Icons.storefront),
                          ),
                          ButtonSegment(
                            value: 'delivery',
                            label: Text('Delivery'),
                            icon: Icon(Icons.delivery_dining),
                          ),
                        ],
                        selected: {_fulfillmentType},
                        onSelectionChanged: (selection) {
                          setState(() => _fulfillmentType = selection.first);
                        },
                      ),
                      if (_fulfillmentType == 'delivery') ...[
                        const SizedBox(height: 16),
                        _ContactField(
                          controller: _addressController,
                          label: 'Delivery Address',
                          icon: Icons.location_on,
                          maxLines: 2,
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? 'Required for delivery'
                              : null,
                        ),
                      ],
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
                        onPressed:
                            _isSubmitting ? null : () => _submitOrder(lines),
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
                          _isSubmitting ? 'Placing order...' : 'Place Order',
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

  const _OrderSuccessSection({required this.orderId});

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
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
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
                    const SizedBox(height: 24),
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
