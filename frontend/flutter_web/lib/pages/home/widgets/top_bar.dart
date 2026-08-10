import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class TopBar extends StatelessWidget {
  final String storeName;
  final bool isLoggedIn;
  final int cartItemCount;
  final VoidCallback onCartTap;
  final VoidCallback onCheckoutTap;
  final VoidCallback onLoginTap;
  final VoidCallback onLogoutTap;

  /// Set only when the signed-in user has staff/owner/admin access to THIS
  /// store - "Manage this store" for an owner/admin, "Kitchen" for staff.
  /// Null on every other store's page, where this same account is just a
  /// customer.
  final String? managementLabel;
  final VoidCallback? onManagementTap;

  const TopBar({
    super.key,
    required this.storeName,
    required this.isLoggedIn,
    required this.cartItemCount,
    required this.onCartTap,
    required this.onCheckoutTap,
    required this.onLoginTap,
    required this.onLogoutTap,
    this.managementLabel,
    this.onManagementTap,
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
          Flexible(
            child: Text(
              storeName,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
      actions: [
        if (managementLabel != null)
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: OutlinedButton.icon(
              onPressed: onManagementTap,
              icon: Icon(
                managementLabel == 'Kitchen'
                    ? Icons.soup_kitchen
                    : Icons.storefront,
                size: 18,
              ),
              label: Text(managementLabel!),
            ),
          ),
        TextButton(
          onPressed: onCheckoutTap,
          child: const Text('Checkout'),
        ),
        if (isLoggedIn)
          TextButton(
            onPressed: () => context.go('/my-orders'),
            child: const Text('My Orders'),
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
              : FilledButton.icon(
                  onPressed: onLoginTap,
                  icon: const Icon(Icons.login),
                  label: const Text('Sign In'),
                ),
        ),
      ],
    );
  }
}
