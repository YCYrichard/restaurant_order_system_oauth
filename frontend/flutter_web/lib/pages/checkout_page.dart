// ignore_for_file: deprecated_member_use

import 'dart:convert';
import 'dart:html' as html;
import 'package:flutter/material.dart';
import '../jwt_decode.dart';
import '../main.dart';

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);

class CheckoutPage extends StatefulWidget {
  final Map<String, int> cart;
  final List<Product> products;
  final String? token;
  final int storeId;

  const CheckoutPage({
    super.key,
    required this.cart,
    required this.products,
    required this.storeId,
    this.token,
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

  bool _isSubmitting = false;
  String? _orderId;
  String? _errorMessage;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  double get _subtotal {
    double total = 0;
    for (final entry in widget.cart.entries) {
      final product = widget.products.firstWhere((p) => p.id == entry.key);
      total += product.price * entry.value;
    }
    return total;
  }

  int get _itemCount {
    return widget.cart.values.fold(0, (sum, qty) => sum + qty);
  }

  Future<void> _submitOrder() async {
    if (!_formKey.currentState!.validate()) return;
    if (widget.cart.isEmpty) {
      setState(() => _errorMessage = 'Your cart is empty.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final userId = widget.token != null && widget.token!.isNotEmpty
        ? JwtPayload.fromToken(widget.token!).id
        : null;

    final storeId = widget.storeId;

    final items = widget.cart.entries.map((e) {
      final product = widget.products.firstWhere((p) => p.id == e.key);
      return {
        // IMPORTANT: use dbProductId to match MySQL products.id
        'productId': product.dbProductId,
        'quantity': e.value,
        'price': product.price,
      };
    }).toList();

    final body = {
      'userId': userId,
      'storeId': storeId,
      'items': items,
      'total': _subtotal,
      'customerName': _nameController.text.trim(),
      'customerPhone': _phoneController.text.trim(),
      'customerEmail': _emailController.text.trim().isEmpty
          ? null
          : _emailController.text.trim(),
      'notes': _notesController.text.trim().isEmpty
          ? null
          : _notesController.text.trim(),
    };

    try {
      final request = await html.HttpRequest.request(
        '$apiBaseUrl/orders',
        method: 'POST',
        requestHeaders: {'Content-Type': 'application/json'},
        sendData: jsonEncode(body),
      );

      if (request.status == 201 || request.status == 200) {
        final data = jsonDecode(request.responseText ?? '{}');
        setState(() {
          _isSubmitting = false;
          _orderId = data['order']?['id']?.toString();
        });
      } else {
        setState(() {
          _isSubmitting = false;
          _errorMessage = 'Failed to place order. Please try again.';
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
                    const Text(
                      'Order Summary',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 16),
                    _OrderSummary(
                      cart: widget.cart,
                      products: widget.products,
                      itemCount: _itemCount,
                      subtotal: _subtotal,
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
                        onPressed: _isSubmitting ? null : _submitOrder,
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
  final Map<String, int> cart;
  final List<Product> products;
  final int itemCount;
  final double subtotal;

  const _OrderSummary({
    required this.cart,
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
          ...cart.entries.map((entry) {
            final product = products.firstWhere((p) => p.id == entry.key);
            final qty = entry.value;
            final lineTotal = product.price * qty;

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${product.name} x$qty',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
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
                      onPressed: () {
                        html.window.location.href = '/';
                      },
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