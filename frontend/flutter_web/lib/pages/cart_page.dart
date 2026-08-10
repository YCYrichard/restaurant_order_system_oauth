import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../features/cart/cart_controller.dart';
import '../features/cart/widgets/cart_summary_section.dart';
import '../features/menu/data/menu_repository.dart';
import '../models/product.dart';

/// Standalone cart page, reachable from the cart icon on any store page.
/// Needs its own product fetch (rather than reading HomePage's state) since
/// it's a separate route - the cart only stores product ids and prices, not
/// names, so rendering line items requires looking the products back up.
class CartPage extends StatefulWidget {
  final int? storeId;

  const CartPage({super.key, required this.storeId});

  @override
  State<CartPage> createState() => _CartPageState();
}

class _CartPageState extends State<CartPage> {
  List<Product> _products = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProducts();
  }

  Future<void> _loadProducts() async {
    final storeId = widget.storeId;

    if (storeId == null) {
      setState(() {
        _loading = false;
        _error = 'This cart link is missing a store.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final products = await MenuRepository.fetchProducts(storeId);

      if (!mounted) return;

      setState(() {
        _products = products;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load your cart. Please try again.';
        _loading = false;
      });
    }
  }

  Product? _findProduct(int productId) {
    for (final product in _products) {
      if (product.id == productId) return product;
    }
    return null;
  }

  /// A line whose product vanished from the menu (86'd or removed) falls
  /// back to this placeholder rather than crashing the cart page.
  Product _productOrPlaceholder(int productId) {
    return _findProduct(productId) ??
        Product(
          id: productId,
          storeId: widget.storeId ?? 0,
          name: 'Item no longer available',
          price: 0,
        );
  }

  void _goToCheckout(CartController cart) {
    final storeId = widget.storeId;

    if (cart.isEmpty || storeId == null) return;

    context.push('/checkout?storeId=$storeId');
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartController>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your Cart'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          onPressed: () => widget.storeId != null
              ? context.go('/store/${widget.storeId}')
              : context.go('/'),
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to menu',
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _loadProducts,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                )
              : SingleChildScrollView(
                  child: CartSummarySection(
                    lines: cart.lines,
                    getProductById: _productOrPlaceholder,
                    cartItemCount: cart.itemCount,
                    cartSubtotal: cart.subtotal(_productOrPlaceholder),
                    onIncreaseQty: cart.increase,
                    onDecreaseQty: cart.decrease,
                    onSetNotes: cart.setNotes,
                    onClearCart: cart.clear,
                    onCheckoutTap: () => _goToCheckout(cart),
                  ),
                ),
    );
  }
}
