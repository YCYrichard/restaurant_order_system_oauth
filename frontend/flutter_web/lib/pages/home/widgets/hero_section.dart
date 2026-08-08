import 'package:flutter/material.dart';

import '../../../core/widgets/mini_stat.dart';

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
            color: Colors.deepOrange.withValues(alpha: 0.10),
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
            MiniStat(label: 'Providers', value: '3'),
            MiniStat(label: 'Categories', value: '4'),
            MiniStat(label: 'Cart Items', value: '$cartItemCount'),
          ],
        ),
      ],
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
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: const Column(
        children: [
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
            backgroundColor: Colors.deepOrange.withValues(alpha: 0.12),
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
