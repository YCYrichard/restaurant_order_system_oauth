// ignore_for_file: deprecated_member_use
import 'package:flutter/material.dart';

import '../../../admin_login_page.dart';

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
              : OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const AdminLoginPage(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.admin_panel_settings),
                  label: const Text('Admin Login'),
                ),
        ),
      ],
    );
  }
}
