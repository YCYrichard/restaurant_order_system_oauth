import 'package:flutter/material.dart';

import '../../../core/widgets/section_container.dart';
import '../../../models/product.dart';

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
    return SectionContainer(
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
              backgroundColor: Colors.deepOrange.withValues(alpha: 0.10),
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
              backgroundColor: Colors.deepOrange.withValues(alpha: 0.10),
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
