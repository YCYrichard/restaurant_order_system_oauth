import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

import '../core/constants/app_config.dart';
import '../features/auth/widgets/social_login_section.dart';
import '../features/cart/widgets/cart_summary_section.dart';
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

  final List<Product> products = const [
    Product(
      id: 'burger_1',
      dbProductId: 1,
      name: 'Classic Beef Burger',
      category: 'Burgers',
      price: 8.90,
      description: 'Juicy beef patty, lettuce, tomato, and house sauce.',
      icon: Icons.lunch_dining,
    ),
    Product(
      id: 'burger_2',
      dbProductId: 2,
      name: 'Spicy Chicken Burger',
      category: 'Burgers',
      price: 9.50,
      description: 'Crispy chicken with spicy mayo and pickles.',
      icon: Icons.local_fire_department,
    ),
    Product(
      id: 'drink_1',
      dbProductId: 3,
      name: 'Fresh Lemon Tea',
      category: 'Drinks',
      price: 2.80,
      description: 'Cold brewed tea with fresh lemon slices.',
      icon: Icons.local_drink,
    ),
    Product(
      id: 'drink_2',
      dbProductId: 4,
      name: 'Iced Americano',
      category: 'Drinks',
      price: 3.20,
      description: 'Smooth coffee served chilled with ice.',
      icon: Icons.coffee,
    ),
    Product(
      id: 'side_1',
      dbProductId: 5,
      name: 'Crispy Fries',
      category: 'Sides',
      price: 3.60,
      description: 'Golden fries with light seasoning.',
      icon: Icons.fastfood,
    ),
    Product(
      id: 'side_2',
      dbProductId: 6,
      name: 'Chicken Nuggets',
      category: 'Sides',
      price: 4.40,
      description: 'Six crispy nuggets with dipping sauce.',
      icon: Icons.set_meal,
    ),
    Product(
      id: 'dessert_1',
      dbProductId: 7,
      name: 'Vanilla Sundae',
      category: 'Desserts',
      price: 3.90,
      description: 'Creamy vanilla ice cream with sweet topping.',
      icon: Icons.icecream,
    ),
    Product(
      id: 'dessert_2',
      dbProductId: 8,
      name: 'Chocolate Lava Cake',
      category: 'Desserts',
      price: 5.20,
      description: 'Warm chocolate cake with soft molten center.',
      icon: Icons.cake_outlined,
    ),
  ];

  final Map<String, int> cart = {};

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

      setState(() {
        stores = loadedStores;

        if (selectedStoreId == null && loadedStores.isNotEmpty) {
          selectedStoreId = int.tryParse(loadedStores.first['id'].toString());
        }

        _loadingStores = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadingStores = false;
        });
      }
    }
  }

  void _selectStore(int storeId) {
    setState(() {
      selectedStoreId = storeId;
    });
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

  void increaseQty(String productId) {
    setState(() {
      cart.update(productId, (value) => value + 1);
    });
  }

  void decreaseQty(String productId) {
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

  Product getProductById(String productId) {
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
      grouped.putIfAbsent(product.category, () => []);
      grouped[product.category]!.add(product);
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
          cart: Map<String, int>.from(cart),
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
              onGoogle: () => _open('http://localhost:3000/auth/google'),
              onFacebook: () => _open('http://localhost:3000/auth/facebook'),
              onLine: () => _open('http://localhost:3000/auth/line'),
              onLogout: _logout,
            ),
            StoreSelectorSection(
              stores: stores,
              selectedStoreId: selectedStoreId,
              isLoading: _loadingStores,
              onSelectStore: _selectStore,
            ),
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
