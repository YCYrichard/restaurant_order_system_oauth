import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../features/cart/cart_controller.dart';
import '../features/cart/widgets/cart_summary_section.dart';
import '../features/menu/data/menu_repository.dart';
import '../models/product.dart';

/// Standalone cart page, reachable from the cart icon on any store page.
/// Resolves its own store from the code (same as HomePage, and for the same
/// reason: this is a separate route, so it can't assume HomePage's
/// in-memory state survived a direct load or hard refresh) - the cart only
/// stores product ids and prices, not names, so rendering line items also
/// requires looking the products back up.
class CartPage extends StatefulWidget {
  final String? code;

  const CartPage({super.key, required this.code});

  @override
  State<CartPage> createState() => _CartPageState();
}

class _CartPageState extends State<CartPage> {
  int? _storeId;
  List<Product> _products = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadStoreAndProducts();
  }

  Future<void> _loadStoreAndProducts() async {
    final code = widget.code;

    if (code == null || code.isEmpty) {
      setState(() {
        _loading = false;
        _error = "This cart link isn't valid.";
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final decoded = await ApiClient.getJson('/stores/public/$code');
      final store = decoded is Map && decoded['store'] is Map
          ? Map<String, dynamic>.from(decoded['store'])
          : null;
      final storeId =
          store == null ? null : int.tryParse(store['id'].toString());

      if (storeId == null) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = 'This restaurant is not available.';
        });
        return;
      }

      final products = await MenuRepository.fetchProducts(storeId);

      if (!mounted) return;

      setState(() {
        _storeId = storeId;
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
          storeId: _storeId ?? 0,
          name: 'Item no longer available',
          price: 0,
        );
  }

  void _goToCheckout(CartController cart) {
    final code = widget.code;

    if (cart.isEmpty || code == null) return;

    context.push('/checkout?code=$code');
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
          onPressed: () => widget.code != null
              ? context.go('/store/${widget.code}')
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
                          onPressed: _loadStoreAndProducts,
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
