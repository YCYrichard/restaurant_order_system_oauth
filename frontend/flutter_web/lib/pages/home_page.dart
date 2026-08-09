import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

import '../core/api/api_client.dart';
import '../core/constants/app_config.dart';
import '../features/auth/widgets/social_login_section.dart';
import '../features/cart/widgets/cart_summary_section.dart';
import '../features/menu/data/menu_repository.dart';
import '../features/menu/widgets/menu_products_section.dart';
import '../features/store/widgets/store_selector_section.dart';
import '../models/product.dart';
import 'checkout_page.dart';
import 'home/widgets/footer_section.dart';
import 'home/widgets/hero_section.dart';
import 'home/widgets/order_steps_section.dart';
import 'home/widgets/top_bar.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String? token;
  String? userMessage;

  List<Map<String, dynamic>> stores = [];
  int? selectedStoreId;
  bool _loadingStores = false;

  List<Product> products = [];
  bool _loadingMenu = false;
  String? _menuError;

  final Map<int, int> cart = {};

  @override
  void initState() {
    super.initState();
    _readAuthFromUrl();
    _loadStores();
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

      var newlySelectedStoreId = selectedStoreId;

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
      // Cart items reference product ids scoped to the previous store.
      cart.clear();
    });

    _loadMenu(storeId);
  }

  void _readAuthFromUrl() {
    final hash = web.window.location.hash;

    if (hash.startsWith('#/auth-success')) {
      final uri = Uri.tryParse(hash.replaceFirst('#', ''));
      final extractedToken = uri?.queryParameters['token'];

      setState(() {
        token = extractedToken;
        userMessage = extractedToken != null && extractedToken.isNotEmpty
            ? 'Signed in successfully.'
            : 'Sign-in completed, but token was not found.';
      });

      if (extractedToken != null && extractedToken.isNotEmpty) {
        web.window.localStorage.setItem('auth_token', extractedToken);
      }
    } else if (hash.startsWith('#/auth-error')) {
      final uri = Uri.tryParse(hash.replaceFirst('#', ''));
      final errorMessage = uri?.queryParameters['message'];

      setState(() {
        userMessage = (errorMessage != null && errorMessage.isNotEmpty)
            ? errorMessage
            : 'Sign-in failed. Please try again.';
      });
    }
  }

  void _open(String url) {
    web.window.location.href = url;
  }

  void _logout() {
    setState(() {
      token = null;
      userMessage = 'You have signed out locally.';
    });

    web.window.localStorage.removeItem('auth_token');
    web.window.localStorage.removeItem('auth_role');
    web.window.localStorage.removeItem('auth_name');
    web.window.location.hash = '';
  }

  void addToCart(Product product) {
    setState(() {
      cart.update(product.id, (value) => value + 1, ifAbsent: () => 1);
      userMessage = '${product.name} added to cart.';
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${product.name} added to cart'),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  void increaseQty(int productId) {
    setState(() {
      cart.update(productId, (value) => value + 1);
    });
  }

  void decreaseQty(int productId) {
    setState(() {
      if (!cart.containsKey(productId)) return;
      final current = cart[productId]!;
      if (current <= 1) {
        cart.remove(productId);
      } else {
        cart[productId] = current - 1;
      }
    });
  }

  void clearCart() {
    setState(() {
      cart.clear();
      userMessage = 'Cart cleared.';
    });
  }

  Product getProductById(int productId) {
    return products.firstWhere((p) => p.id == productId);
  }

  int get cartItemCount {
    return cart.values.fold(0, (sum, qty) => sum + qty);
  }

  double get cartSubtotal {
    double total = 0;
    for (final entry in cart.entries) {
      final product = getProductById(entry.key);
      total += product.price * entry.value;
    }
    return total;
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

  void _goToCheckout() {
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

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => CheckoutPage(
          cart: Map<int, int>.from(cart),
          products: products,
          token: token,
          storeId: selectedStoreId!,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLoggedIn = token != null && token!.isNotEmpty;

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
          onCheckoutTap: _goToCheckout,
          onLogoutTap: _logout,
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
              onCheckoutTap: _goToCheckout,
            ),
            SocialLoginSection(
              isLoggedIn: isLoggedIn,
              token: token,
              message: userMessage,
              onGoogle: () => _open('$apiBaseUrl/auth/google'),
              onFacebook: () => _open('$apiBaseUrl/auth/facebook'),
              onLine: () => _open('$apiBaseUrl/auth/line'),
              onLogout: _logout,
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
                cart: cart,
                onAddToCart: addToCart,
              ),
            CartSummarySection(
              cart: cart,
              getProductById: getProductById,
              cartItemCount: cartItemCount,
              cartSubtotal: cartSubtotal,
              onIncreaseQty: increaseQty,
              onDecreaseQty: decreaseQty,
              onClearCart: clearCart,
              onCheckoutTap: _goToCheckout,
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
