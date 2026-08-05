// ignore_for_file: deprecated_member_use

import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'pages/checkout_page.dart';

void main() {
  runApp(const MyApp());
}

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Restaurant Ordering System',
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.deepOrange,
        scaffoldBackgroundColor: const Color(0xFFFFFBF7),
      ),
      home: const HomePage(),
    );
  }
}

/// Product model with both frontend id and MySQL dbProductId.
class Product {
  final String id;        // frontend ID (e.g. "burger_1")
  final int dbProductId;  // MySQL products.id
  final String name;
  final String category;
  final double price;
  final String description;
  final IconData icon;
  final bool isActive;

  const Product({
    required this.id,
    required this.dbProductId,
    required this.name,
    required this.category,
    required this.price,
    required this.description,
    required this.icon,
    this.isActive = true,
  });
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String? token;
  String? userMessage;

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
  }

  void _readAuthFromUrl() {
    final hash = html.window.location.hash;

    if (hash.startsWith('#/auth-success')) {
      final uri = Uri.tryParse(hash.replaceFirst('#', ''));
      final extractedToken = uri?.queryParameters['token'];

      setState(() {
        token = extractedToken;
        userMessage = extractedToken != null && extractedToken.isNotEmpty
            ? 'Signed in successfully.'
            : 'Sign-in completed, but token was not found.';
      });
    }
  }

  void _open(String url) {
    html.window.location.href = url;
  }

  void _logout() {
    setState(() {
      token = null;
      userMessage = 'You have signed out locally.';
    });
    html.window.location.hash = '';
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

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => CheckoutPage(
          cart: Map<String, int>.from(cart),
          products: products,
          token: token,
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
            const StoreInfoSection(),
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
        html.document
            .getElementById('login-section')
            ?.scrollIntoView(html.ScrollAlignment.TOP);
        break;
      case 'menu':
        html.document
            .getElementById('menu-section')
            ?.scrollIntoView(html.ScrollAlignment.TOP);
        break;
      case 'store':
        html.document
            .getElementById('store-section')
            ?.scrollIntoView(html.ScrollAlignment.TOP);
        break;
      case 'cart':
        html.document
            .getElementById('cart-section')
            ?.scrollIntoView(html.ScrollAlignment.TOP);
        break;
    }
  }
}

class TopBar extends StatelessWidget {
  final bool isLoggedIn;
  final int cartItemCount;
  final VoidCallback onMenuTap;
  final VoidCallback onStoreTap;
  final VoidCallback onLoginTap;
  final VoidCallback onCartTap;
  final VoidCallback onCheckoutTap;
  final VoidCallback onLogoutTap;

  const TopBar({
    super.key,
    required this.isLoggedIn,
    required this.cartItemCount,
    required this.onMenuTap,
    required this.onStoreTap,
    required this.onLoginTap,
    required this.onCartTap,
    required this.onCheckoutTap,
    required this.onLogoutTap,
  });

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      elevation: 0,
      titleSpacing: 24,
      title: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.deepOrange,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.restaurant_menu, color: Colors.white),
          ),
          const SizedBox(width: 12),
          const Text(
            'Orange Bistro',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: onMenuTap,
          child: const Text('Menu'),
        ),
        TextButton(
          onPressed: onStoreTap,
          child: const Text('Store'),
        ),
        TextButton(
          onPressed: onCheckoutTap,
          child: const Text('Checkout'),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Stack(
            children: [
              IconButton(
                onPressed: onCartTap,
                icon: const Icon(Icons.shopping_cart_outlined),
                tooltip: 'Cart',
              ),
              if (cartItemCount > 0)
                Positioned(
                  right: 4,
                  top: 4,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.deepOrange,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '$cartItemCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Padding(
          padding: const EdgeInsets.only(right: 16),
          child: isLoggedIn
              ? FilledButton.tonalIcon(
                  onPressed: onLogoutTap,
                  icon: const Icon(Icons.logout),
                  label: const Text('Logout'),
                )
              : FilledButton(
                  onPressed: onLoginTap,
                  child: const Text('Login'),
                ),
        ),
      ],
    );
  }
}

class HeroSection extends StatelessWidget {
  final bool isLoggedIn;
  final int cartItemCount;
  final VoidCallback onStartOrder;
  final VoidCallback onSignIn;
  final VoidCallback onCheckoutTap;

  const HeroSection({
    super.key,
    required this.isLoggedIn,
    required this.cartItemCount,
    required this.onStartOrder,
    required this.onSignIn,
    required this.onCheckoutTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 36),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth >= 900;

              return Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFFF0E8), Color(0xFFFFFBF7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(32),
                ),
                child: isWide
                    ? Row(
                        children: [
                          Expanded(
                            flex: 6,
                            child: _HeroText(
                              isLoggedIn: isLoggedIn,
                              cartItemCount: cartItemCount,
                              onStartOrder: onStartOrder,
                              onSignIn: onSignIn,
                              onCheckoutTap: onCheckoutTap,
                            ),
                          ),
                          const SizedBox(width: 24),
                          const Expanded(
                            flex: 5,
                            child: _HeroHighlightCard(),
                          ),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _HeroText(
                            isLoggedIn: isLoggedIn,
                            cartItemCount: cartItemCount,
                            onStartOrder: onStartOrder,
                            onSignIn: onSignIn,
                            onCheckoutTap: onCheckoutTap,
                          ),
                          const SizedBox(height: 24),
                          const _HeroHighlightCard(),
                        ],
                      ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _HeroText extends StatelessWidget {
  final bool isLoggedIn;
  final int cartItemCount;
  final VoidCallback onStartOrder;
  final VoidCallback onSignIn;
  final VoidCallback onCheckoutTap;

  const _HeroText({
    required this.isLoggedIn,
    required this.cartItemCount,
    required this.onStartOrder,
    required this.onSignIn,
    required this.onCheckoutTap,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.deepOrange.withOpacity(0.10),
            borderRadius: BorderRadius.circular(999),
          ),
          child: const Text(
            'Fast ordering • Pickup • Delivery',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.deepOrange,
            ),
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Order your favorites in minutes.',
          style: TextStyle(
            fontSize: 42,
            height: 1.1,
            fontWeight: FontWeight.w800,
            color: Color(0xFF1C1B1A),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          isLoggedIn
              ? 'Welcome back. Browse the menu and build your cart.'
              : 'A modern restaurant ordering experience with social login, quick menu browsing, and a smooth checkout flow.',
          style: const TextStyle(
            fontSize: 16,
            height: 1.6,
            color: Color(0xFF5F5A57),
          ),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            FilledButton.icon(
              onPressed: onStartOrder,
              icon: const Icon(Icons.shopping_bag_outlined),
              label: const Text('Start Order'),
              style: FilledButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              ),
            ),
            OutlinedButton.icon(
              onPressed: isLoggedIn ? onCheckoutTap : onSignIn,
              icon: Icon(isLoggedIn ? Icons.payment : Icons.login),
              label: Text(isLoggedIn ? 'Go to Checkout' : 'Sign In'),
              style: OutlinedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            const _MiniStat(label: 'Providers', value: '3'),
            const _MiniStat(label: 'Categories', value: '4'),
            _MiniStat(label: 'Cart Items', value: '$cartItemCount'),
          ],
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;

  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 120,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(color: Color(0xFF6D6764)),
          ),
        ],
      ),
    );
  }
}

class _HeroHighlightCard extends StatelessWidget {
  const _HeroHighlightCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: const [
          _PreviewItem(
            icon: Icons.local_fire_department,
            title: 'Hot Deals',
            subtitle: 'Lunch combo with drink and fries.',
            price: '\$12.90',
          ),
          SizedBox(height: 14),
          _PreviewItem(
            icon: Icons.ramen_dining,
            title: 'Chef Special',
            subtitle: 'Fresh bowl made for quick pickup.',
            price: '\$15.50',
          ),
          SizedBox(height: 14),
          _PreviewItem(
            icon: Icons.icecream,
            title: 'Dessert Add-on',
            subtitle: 'Finish your meal with a sweet extra.',
            price: '\$4.20',
          ),
        ],
      ),
    );
  }
}

class _PreviewItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String price;

  const _PreviewItem({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.price,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8F3),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: Colors.deepOrange.withOpacity(0.12),
            child: Icon(icon, color: Colors.deepOrange),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Color(0xFF6A6461),
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            price,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
        ],
      ),
    );
  }
}

class SocialLoginSection extends StatelessWidget {
  final bool isLoggedIn;
  final String? token;
  final String? message;
  final VoidCallback onGoogle;
  final VoidCallback onFacebook;
  final VoidCallback onLine;
  final VoidCallback onLogout;

  const SocialLoginSection({
    super.key,
    required this.isLoggedIn,
    required this.token,
    required this.message,
    required this.onGoogle,
    required this.onFacebook,
    required this.onLine,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return _SectionContainer(
      sectionId: 'login-section',
      title: 'Sign in to continue',
      subtitle:
          'Use one of the social providers below to continue into your restaurant ordering account.',
      child: Column(
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: [
              _SocialButton(
                label: 'Continue with Google',
                icon: Icons.g_mobiledata_rounded,
                onPressed: onGoogle,
              ),
              _SocialButton(
                label: 'Continue with Facebook',
                icon: Icons.facebook,
                onPressed: onFacebook,
              ),
              _SocialButton(
                label: 'Continue with LINE',
                icon: Icons.chat_bubble,
                onPressed: onLine,
              ),
            ],
          ),
          const SizedBox(height: 24),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: isLoggedIn
                  ? const Color(0xFFE9F8EE)
                  : const Color(0xFFF5F5F5),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isLoggedIn ? 'Login status: signed in' : 'Login status: guest',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  message ??
                      'After successful login, your token will be detected from the auth-success URL.',
                  style: const TextStyle(
                    color: Color(0xFF5E5A57),
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 14),
                if (token != null && token!.isNotEmpty) ...[
                  const Text(
                    'JWT Token',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  SelectableText(
                    token!,
                    style: const TextStyle(fontSize: 12, height: 1.5),
                  ),
                  const SizedBox(height: 14),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      onPressed: onLogout,
                      icon: const Icon(Icons.logout),
                      label: const Text('Logout locally'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  const _SocialButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return FilledButton.tonalIcon(
      onPressed: onPressed,
      icon: Icon(icon),
      label: Text(label),
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      ),
    );
  }
}

class StoreInfoSection extends StatelessWidget {
  const StoreInfoSection({super.key});

  @override
  Widget build(BuildContext context) {
    return _SectionContainer(
      sectionId: 'store-section',
      title: 'Store information',
      subtitle: 'Simple business details customers usually need before ordering.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth > 700;
          final children = const [
            _InfoCard(
              icon: Icons.location_on_outlined,
              title: 'Address',
              value: 'Taoyuan City Demo Store, Zhongli District',
            ),
            _InfoCard(
              icon: Icons.access_time_outlined,
              title: 'Hours',
              value: 'Mon - Sun • 10:00 AM - 9:30 PM',
            ),
            _InfoCard(
              icon: Icons.call_outlined,
              title: 'Phone',
              value: '+886 3 123 4567',
            ),
          ];

          if (isWide) {
            return Row(
              children: children
                  .map((e) => Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: e,
                        ),
                      ))
                  .toList(),
            );
          }

          return Column(
            children: children
                .map((e) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: e,
                    ))
                .toList(),
          );
        },
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;

  const _InfoCard({
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: Colors.orange.withOpacity(0.12),
              child: Icon(icon, color: Colors.deepOrange),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    value,
                    style: const TextStyle(
                      color: Color(0xFF625D5A),
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class MenuProductsSection extends StatelessWidget {
  final Map<String, List<Product>> groupedProducts;
  final Map<String, int> cart;
  final void Function(Product product) onAddToCart;

  const MenuProductsSection({
    super.key,
    required this.groupedProducts,
    required this.cart,
    required this.onAddToCart,
  });

  @override
  Widget build(BuildContext context) {
    return _SectionContainer(
      sectionId: 'menu-section',
      title: 'Menu',
      subtitle:
          'Customers typically browse by category first, then add items directly into the cart from product cards.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: groupedProducts.entries.map((entry) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 28),
            child: _CategoryProductGroup(
              category: entry.key,
              products: entry.value,
              cart: cart,
              onAddToCart: onAddToCart,
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _CategoryProductGroup extends StatelessWidget {
  final String category;
  final List<Product> products;
  final Map<String, int> cart;
  final void Function(Product product) onAddToCart;

  const _CategoryProductGroup({
    required this.category,
    required this.products,
    required this.cart,
    required this.onAddToCart,
  });

  IconData _categoryIcon(String category) {
    switch (category) {
      case 'Burgers':
        return Icons.lunch_dining;
      case 'Drinks':
        return Icons.local_drink;
      case 'Sides':
        return Icons.fastfood;
      case 'Desserts':
        return Icons.icecream;
      default:
        return Icons.restaurant;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            CircleAvatar(
              backgroundColor: Colors.deepOrange.withOpacity(0.10),
              child: Icon(_categoryIcon(category), color: Colors.deepOrange),
            ),
            const SizedBox(width: 12),
            Text(
              category,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        LayoutBuilder(
          builder: (context, constraints) {
            int crossAxisCount = 1;
            if (constraints.maxWidth >= 1000) {
              crossAxisCount = 2;
            }

            return GridView.builder(
              itemCount: products.length,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: crossAxisCount == 1 ? 2.2 : 2.0,
              ),
              itemBuilder: (context, index) {
                final product = products[index];
                final qty = cart[product.id] ?? 0;
                return _ProductCard(
                  product: product,
                  qtyInCart: qty,
                  onAddToCart: onAddToCart,
                );
              },
            );
          },
        ),
      ],
    );
  }
}

class _ProductCard extends StatelessWidget {
  final Product product;
  final int qtyInCart;
  final void Function(Product product) onAddToCart;

  const _ProductCard({
    required this.product,
    required this.qtyInCart,
    required this.onAddToCart,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            CircleAvatar(
              radius: 30,
              backgroundColor: Colors.deepOrange.withOpacity(0.10),
              child: Icon(product.icon, color: Colors.deepOrange, size: 30),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    product.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    product.description,
                    style: const TextStyle(
                      color: Color(0xFF625D5A),
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Text(
                        '\$${product.price.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                          color: Colors.deepOrange,
                        ),
                      ),
                      if (qtyInCart > 0) ...[
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF3EB),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            'In cart: $qtyInCart',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: Colors.deepOrange,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            FilledButton.icon(
              onPressed: product.isActive ? () => onAddToCart(product) : null,
              icon: const Icon(Icons.add_shopping_cart),
              label: const Text('Add'),
            ),
          ],
        ),
      ),
    );
  }
}

class CartSummarySection extends StatelessWidget {
  final Map<String, int> cart;
  final Product Function(String productId) getProductById;
  final int cartItemCount;
  final double cartSubtotal;
  final void Function(String productId) onIncreaseQty;
  final void Function(String productId) onDecreaseQty;
  final VoidCallback onClearCart;
  final VoidCallback onCheckoutTap;

  const CartSummarySection({
    super.key,
    required this.cart,
    required this.getProductById,
    required this.cartItemCount,
    required this.cartSubtotal,
    required this.onIncreaseQty,
    required this.onDecreaseQty,
    required this.onClearCart,
    required this.onCheckoutTap,
  });

  @override
  Widget build(BuildContext context) {
    return _SectionContainer(
      sectionId: 'cart-section',
      title: 'Cart summary',
      subtitle:
          'A good ordering flow keeps item count, subtotal, and quantity controls visible before checkout.',
      child: cart.isEmpty
          ? Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xFFF7F7F7),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'Your cart is empty. Add some menu items to start an order.',
                style: TextStyle(
                  fontSize: 16,
                  color: Color(0xFF625D5A),
                ),
              ),
            )
          : Column(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF5EF),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Wrap(
                    spacing: 24,
                    runSpacing: 12,
                    children: [
                      _CartStat(
                        label: 'Total items',
                        value: '$cartItemCount',
                      ),
                      _CartStat(
                        label: 'Subtotal',
                        value: '\$${cartSubtotal.toStringAsFixed(2)}',
                      ),
                      _CartStat(
                        label: 'Status',
                        value: 'Ready',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                ...cart.entries.map((entry) {
                  final product = getProductById(entry.key);
                  final qty = entry.value;
                  final lineTotal = product.price * qty;

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Card(
                      color: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Row(
                          children: [
                            CircleAvatar(
                              backgroundColor:
                                  Colors.deepOrange.withOpacity(0.10),
                              child: Icon(
                                product.icon,
                                color: Colors.deepOrange,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    product.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '\$${product.price.toStringAsFixed(2)} each',
                                    style: const TextStyle(
                                      color: Color(0xFF625D5A),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () => onDecreaseQty(product.id),
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            Text(
                              '$qty',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            IconButton(
                              onPressed: () => onIncreaseQty(product.id),
                              icon: const Icon(Icons.add_circle_outline),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(
                              width: 88,
                              child: Text(
                                '\$${lineTotal.toStringAsFixed(2)}',
                                textAlign: TextAlign.right,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                  color: Colors.deepOrange,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      OutlinedButton.icon(
                        onPressed: onClearCart,
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Clear cart'),
                      ),
                      FilledButton.icon(
                        onPressed: onCheckoutTap,
                        icon: const Icon(Icons.payment),
                        label: const Text('Checkout'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class _CartStat extends StatelessWidget {
  final String label;
  final String value;

  const _CartStat({
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

class OrderStepsSection extends StatelessWidget {
  const OrderStepsSection({super.key});

  @override
  Widget build(BuildContext context) {
    return _SectionContainer(
      title: 'How ordering works',
      subtitle:
          'A simple flow for the next features you will connect after the first page.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth > 800;
          final steps = const [
            _StepCard(
              number: '01',
              title: 'Login',
              description: 'Sign in with Google, Facebook, or LINE.',
            ),
            _StepCard(
              number: '02',
              title: 'Choose items',
              description: 'Browse categories and add products to your cart.',
            ),
            _StepCard(
              number: '03',
              title: 'Checkout',
              description: 'Confirm store, order details, and payment flow later.',
            ),
          ];

          return isWide
              ? Row(
                  children: steps
                      .map((step) => Expanded(
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 8),
                              child: step,
                            ),
                          ))
                      .toList(),
                )
              : Column(
                  children: steps
                      .map((step) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: step,
                          ))
                      .toList(),
                );
        },
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  final String number;
  final String title;
  final String description;

  const _StepCard({
    required this.number,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFFFFF5EF),
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              number,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: Colors.deepOrange,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              description,
              style: const TextStyle(
                color: Color(0xFF625D5A),
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class FooterSection extends StatelessWidget {
  const FooterSection({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: const Color(0xFF1F1A17),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'Orange Bistro',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(height: 10),
              Text(
                'Restaurant ordering system starter with Flutter Web, Node.js backend, MySQL user storage, and social OAuth login.',
                style: TextStyle(
                  color: Color(0xFFD8D0CB),
                  height: 1.6,
                ),
              ),
              SizedBox(height: 16),
              Text(
                'Next build targets: backend product API, cart persistence, and checkout flow.',
                style: TextStyle(
                  color: Color(0xFFFFB38A),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionContainer extends StatelessWidget {
  final String? sectionId;
  final String title;
  final String subtitle;
  final Widget child;

  const _SectionContainer({
    this.sectionId,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      key: sectionId != null ? ValueKey(sectionId) : null,
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFFFDFDFD),
              borderRadius: BorderRadius.circular(28),
            ),
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (sectionId != null)
                  Builder(
                    builder: (context) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        final element =
                            html.document.getElementById(sectionId!);
                        if (element == null) {
                          final hostElement =
                              html.document.querySelector('[flt-glass-pane]');
                          if (hostElement != null) {
                            final anchor = html.DivElement()..id = sectionId!;
                            hostElement.append(anchor);
                          }
                        }
                      });
                      return const SizedBox.shrink();
                    },
                  ),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF1D1B19),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 16,
                    height: 1.6,
                    color: Color(0xFF625D5A),
                  ),
                ),
                const SizedBox(height: 22),
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }
}