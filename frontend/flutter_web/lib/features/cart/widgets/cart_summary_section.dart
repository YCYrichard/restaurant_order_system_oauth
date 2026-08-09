import 'package:flutter/material.dart';

import '../../../core/widgets/section_container.dart';
import '../../../core/widgets/stat_chip.dart';
import '../../../models/product.dart';

class CartSummarySection extends StatelessWidget {
  final Map<int, int> cart;
  final Product Function(int productId) getProductById;
  final int cartItemCount;
  final double cartSubtotal;
  final void Function(int productId) onIncreaseQty;
  final void Function(int productId) onDecreaseQty;
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
    return SectionContainer(
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
                      StatChip(
                        label: 'Total items',
                        value: '$cartItemCount',
                      ),
                      StatChip(
                        label: 'Subtotal',
                        value: '\$${cartSubtotal.toStringAsFixed(2)}',
                      ),
                      const StatChip(
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
                                  Colors.deepOrange.withValues(alpha: 0.10),
                              child: const Icon(
                                Icons.restaurant_menu,
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
