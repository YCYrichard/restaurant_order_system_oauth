import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/api/api_client.dart';
import '../core/auth/auth_controller.dart';
import '../features/cart/cart_controller.dart';
import '../features/cart/widgets/cart_summary_section.dart';
import '../features/checkout/widgets/pickup_time_selector.dart';
import '../features/menu/data/menu_repository.dart';
import '../features/menu/widgets/menu_products_section.dart';
import '../features/menu/widgets/option_picker_sheet.dart';
import '../models/product.dart';
import 'home/widgets/store_header_section.dart';
import 'home/widgets/top_bar.dart';

/// One store's ordering page - the customer's entry point, reached via that
/// store's QR code or a direct link (never an in-app store picker; see
/// RootRedirectPage).
class HomePage extends StatefulWidget {
  final int? storeId;

  /// Set from /store/:storeId?table=N when a customer scans a table's QR
  /// code. Implies a dine-in order for that table.
  final int? tableNumber;

  const HomePage({super.key, required this.storeId, this.tableNumber});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  Map<String, dynamic>? _store;
  bool _loadingStore = true;
  String? _storeError;

  List<Product> products = [];
  bool _loadingMenu = false;
  String? _menuError;

  Map<String, dynamic>? _pickupSlots;
  bool _loadingPickupSlots = true;
  // Null means ASAP - the common case, and the default.
  String? _selectedReadyAt;

  @override
  void initState() {
    super.initState();
    _loadStore();

    if (widget.storeId != null) {
      _loadMenu(widget.storeId!);
      _loadPickupSlots(widget.storeId!);
    }
  }

  Future<void> _loadStore() async {
    final storeId = widget.storeId;

    if (storeId == null) {
      setState(() {
        _loadingStore = false;
        _storeError = "This ordering link isn't valid.";
      });
      return;
    }

    setState(() {
      _loadingStore = true;
      _storeError = null;
    });

    try {
      // The list endpoint (rather than a single-store one) is what already
      // exists and already carries is_open/closed_reason/today_hours.
      final decoded = await ApiClient.getJson('/stores/public');
      final stores = decoded is Map && decoded['stores'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['stores'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      final match = stores.firstWhere(
        (store) => int.tryParse(store['id'].toString()) == storeId,
        orElse: () => const <String, dynamic>{},
      );

      if (!mounted) return;

      setState(() {
        _store = match.isEmpty ? null : match;
        _storeError = match.isEmpty ? 'This restaurant is not available.' : null;
        _loadingStore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _storeError = 'Unable to load this restaurant. Please try again.';
        _loadingStore = false;
      });
    }
  }

  Future<void> _loadMenu(int storeId) async {
    setState(() {
      _loadingMenu = true;
      _menuError = null;
    });

    try {
      final loadedProducts = await MenuRepository.fetchProducts(storeId);

      if (!mounted) return;

      // The cart persists across visits (localStorage), so a customer who
      // last ordered from a different store and then opens this one's QR
      // code/link would otherwise carry cart lines this menu doesn't
      // recognise - drop those rather than crashing on lookup.
      final validIds = loadedProducts.map((p) => p.id).toSet();
      final cart = context.read<CartController>();
      final staleProductIds = cart.lines
          .map((line) => line.productId)
          .where((productId) => !validIds.contains(productId))
          .toSet();

      for (final productId in staleProductIds) {
        cart.removeProduct(productId);
      }

      setState(() {
        products = loadedProducts;
        _loadingMenu = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;

      setState(() {
        _menuError = error.message;
        _loadingMenu = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _menuError = 'Unable to load the menu. Please try again.';
        _loadingMenu = false;
      });
    }
  }

  Future<void> _loadPickupSlots(int storeId) async {
    setState(() => _loadingPickupSlots = true);

    try {
      final decoded = await ApiClient.getJson('/stores/$storeId/pickup-slots');

      if (!mounted) return;

      setState(() {
        _pickupSlots = Map<String, dynamic>.from(decoded);
        _loadingPickupSlots = false;
      });
    } catch (_) {
      // ASAP still works even if this failed to load - it's the server
      // default when no desiredReadyAt is sent, so there's nothing to
      // block on here.
      if (!mounted) return;
      setState(() => _loadingPickupSlots = false);
    }
  }

  Future<void> _addToCart(Product product) async {
    var chosen = const <ModifierOption>[];

    // Products with options go through the picker; plain ones stay a
    // single tap.
    if (product.hasModifiers) {
      final result = await showDialog<List<ModifierOption>>(
        context: context,
        builder: (dialogContext) => OptionPickerSheet(product: product),
      );

      if (result == null) return; // cancelled
      chosen = result;
    }

    if (!mounted) return;

    context.read<CartController>().add(product, options: chosen);

    final label = chosen.isEmpty
        ? product.name
        : '${product.name} (${chosen.map((o) => o.name).join(', ')})';

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label added to cart'),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  Product getProductById(int productId) {
    return products.firstWhere((p) => p.id == productId);
  }

  Map<String, List<Product>> get groupedProducts {
    final Map<String, List<Product>> grouped = {};
    for (final product in products) {
      final category = product.categoryName ?? 'Other';
      grouped.putIfAbsent(category, () => []);
      grouped[category]!.add(product);
    }
    return grouped;
  }

  void _goToCheckout(CartController cart) {
    if (cart.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Your cart is empty. Add items before checkout.'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    if (widget.storeId == null) return;

    // Stop the customer at the cart rather than letting them fill in a whole
    // checkout form only to have the server reject it. The server check is
    // still the authority - this is just a courtesy.
    if (_store?['is_open'] == false) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _store?['closed_reason']?.toString() ??
                'This store is currently closed.',
          ),
          duration: const Duration(seconds: 3),
        ),
      );
      return;
    }

    final tableParam =
        widget.tableNumber != null ? '&table=${widget.tableNumber}' : '';
    final readyAtParam = _selectedReadyAt != null
        ? '&readyAt=${Uri.encodeComponent(_selectedReadyAt!)}'
        : '';

    context.push('/checkout?storeId=${widget.storeId}$tableParam$readyAtParam');
  }

  void _goToLogin() {
    context.push('/login?next=${Uri.encodeComponent('/store/${widget.storeId}')}');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final cart = context.watch<CartController>();

    if (_loadingStore) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_storeError != null || _store == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.storefront_outlined,
                    size: 48, color: Colors.grey),
                const SizedBox(height: 16),
                Text(
                  _storeError ?? 'This restaurant is not available.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      );
    }

    final store = _store!;

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(72),
        child: TopBar(
          storeName: store['name']?.toString() ?? 'Restaurant',
          isLoggedIn: auth.isLoggedIn,
          cartItemCount: cart.itemCount,
          onCartTap: () => context.push('/store/${widget.storeId}/cart'),
          onCheckoutTap: () => _goToCheckout(cart),
          onLoginTap: _goToLogin,
          onLogoutTap: () => context.read<AuthController>().logout(),
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            StoreHeaderSection(
              name: store['name']?.toString() ?? 'Restaurant',
              address: store['address']?.toString(),
              phone: store['phone']?.toString(),
              isOpen: store['is_open'] != false,
              closedReason: store['closed_reason']?.toString(),
              todayHours: store['today_hours'] is Map
                  ? '${store['today_hours']['open']}-${store['today_hours']['close']}'
                  : null,
            ),
            if (widget.tableNumber != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
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
                        'Ordering for table ${widget.tableNumber} — '
                        'your order will be brought to your table.',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF625D5A),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            // Dine-in via table QR is brought to the table, not picked up
            // at a chosen time - the selector only applies to pickup.
            if (widget.tableNumber == null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1200),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: PickupTimeSelector(
                        pickupSlots: _pickupSlots,
                        loading: _loadingPickupSlots,
                        selectedReadyAt: _selectedReadyAt,
                        onSelect: (value) =>
                            setState(() => _selectedReadyAt = value),
                      ),
                    ),
                  ),
                ),
              ),
            if (_loadingMenu)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_menuError != null)
              Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  _menuError!,
                  style: const TextStyle(color: Colors.redAccent),
                ),
              )
            else if (products.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Text('No menu items available for this store yet.'),
              )
            else
              MenuProductsSection(
                groupedProducts: groupedProducts,
                cart: cart.quantitiesByProduct,
                onAddToCart: _addToCart,
              ),
            CartSummarySection(
              lines: cart.lines,
              getProductById: getProductById,
              cartItemCount: cart.itemCount,
              cartSubtotal: cart.subtotal(getProductById),
              onIncreaseQty: cart.increase,
              onDecreaseQty: cart.decrease,
              onSetNotes: cart.setNotes,
              onClearCart: cart.clear,
              onCheckoutTap: () => _goToCheckout(cart),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
