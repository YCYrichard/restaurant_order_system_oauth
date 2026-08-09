import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:web/web.dart' as web;

import '../core/api/api_client.dart';
import '../core/auth/auth_controller.dart';
import '../core/constants/app_config.dart';
import '../features/auth/widgets/social_login_section.dart';
import '../features/cart/cart_controller.dart';
import '../features/cart/widgets/cart_summary_section.dart';
import '../features/menu/data/menu_repository.dart';
import '../features/menu/widgets/menu_products_section.dart';
import '../features/store/widgets/store_selector_section.dart';
import '../models/product.dart';
import 'home/widgets/footer_section.dart';
import 'home/widgets/hero_section.dart';
import 'home/widgets/order_steps_section.dart';
import 'home/widgets/top_bar.dart';

class HomePage extends StatefulWidget {
  /// When set (via the /store/:storeId route), that store's menu is loaded
  /// directly instead of defaulting to whichever store happens to come back
  /// first from /stores/public - lets a store be linked to directly.
  final int? initialStoreId;

  const HomePage({super.key, this.initialStoreId});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<Map<String, dynamic>> stores = [];
  int? selectedStoreId;
  bool _loadingStores = false;

  List<Product> products = [];
  bool _loadingMenu = false;
  String? _menuError;

  @override
  void initState() {
    super.initState();

    // Set before _loadStores so its "no store picked yet" default doesn't
    // override the store named in the URL.
    selectedStoreId = widget.initialStoreId;

    _loadStores();

    if (selectedStoreId != null) {
      _loadMenu(selectedStoreId!);
    }
  }

  Future<void> _loadStores() async {
    setState(() {
      _loadingStores = true;
    });

    try {
      final response = await http.get(
        Uri.parse('$apiBaseUrl/stores/public'),
        headers: {'Accept': 'application/json'},
      );

      if (response.statusCode != 200) {
        setState(() {
          _loadingStores = false;
        });
        return;
      }

      final decoded = jsonDecode(response.body);

      final loadedStores = decoded is Map && decoded['stores'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['stores'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      // Only set when this call is what picked the store - if a store was
      // already chosen (e.g. from /store/:storeId), initState has already
      // kicked off its menu load and repeating it here would double-fetch.
      int? newlySelectedStoreId;

      setState(() {
        stores = loadedStores;

        if (selectedStoreId == null && loadedStores.isNotEmpty) {
          newlySelectedStoreId =
              int.tryParse(loadedStores.first['id'].toString());
          selectedStoreId = newlySelectedStoreId;
        }

        _loadingStores = false;
      });

      if (newlySelectedStoreId != null) {
        _loadMenu(newlySelectedStoreId!);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadingStores = false;
        });
      }
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

  void _selectStore(int storeId) {
    if (storeId == selectedStoreId) return;

    setState(() {
      selectedStoreId = storeId;
    });

    // Cart items reference product ids scoped to the previous store.
    context.read<CartController>().clear();
    _loadMenu(storeId);
  }

  void _open(String url) {
    web.window.location.href = url;
  }

  void _addToCart(Product product) {
    context.read<CartController>().add(product);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${product.name} added to cart'),
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

    if (selectedStoreId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a store before checking out.'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    context.push('/checkout?storeId=$selectedStoreId');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final cart = context.watch<CartController>();

    final isLoggedIn = auth.isLoggedIn;
    final cartItemCount = cart.itemCount;
    final cartSubtotal = cart.subtotal(getProductById);

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(72),
        child: TopBar(
          isLoggedIn: isLoggedIn,
          cartItemCount: cartItemCount,
          onLoginTap: () => _scrollToSection('login'),
          onMenuTap: () => _scrollToSection('menu'),
          onStoreTap: () => _scrollToSection('store'),
          onCartTap: () => _scrollToSection('cart'),
          onCheckoutTap: () => _goToCheckout(cart),
          onLogoutTap: () => context.read<AuthController>().logout(),
        ),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            HeroSection(
              isLoggedIn: isLoggedIn,
              cartItemCount: cartItemCount,
              onStartOrder: () => _scrollToSection('menu'),
              onSignIn: () => _scrollToSection('login'),
              onCheckoutTap: () => _goToCheckout(cart),
            ),
            SocialLoginSection(
              isLoggedIn: isLoggedIn,
              token: auth.token,
              message: null,
              onGoogle: () => _open('$apiBaseUrl/auth/google'),
              onFacebook: () => _open('$apiBaseUrl/auth/facebook'),
              onLine: () => _open('$apiBaseUrl/auth/line'),
              onLogout: () => context.read<AuthController>().logout(),
            ),
            StoreSelectorSection(
              stores: stores,
              selectedStoreId: selectedStoreId,
              isLoading: _loadingStores,
              onSelectStore: _selectStore,
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
                cart: cart.items,
                onAddToCart: _addToCart,
              ),
            CartSummarySection(
              cart: cart.items,
              getProductById: getProductById,
              cartItemCount: cartItemCount,
              cartSubtotal: cartSubtotal,
              onIncreaseQty: cart.increase,
              onDecreaseQty: cart.decrease,
              onClearCart: cart.clear,
              onCheckoutTap: () => _goToCheckout(cart),
            ),
            const OrderStepsSection(),
            const FooterSection(),
          ],
        ),
      ),
    );
  }

  void _scrollToSection(String section) {
    switch (section) {
      case 'login':
        web.document.getElementById('login-section')?.scrollIntoView();
        break;
      case 'menu':
        web.document.getElementById('menu-section')?.scrollIntoView();
        break;
      case 'store':
        web.document.getElementById('store-section')?.scrollIntoView();
        break;
      case 'cart':
        web.document.getElementById('cart-section')?.scrollIntoView();
        break;
    }
  }
}
