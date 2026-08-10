import 'package:flutter/material.dart';

import '../../../core/widgets/section_container.dart';
import '../../../core/widgets/stat_chip.dart';
import '../../../models/product.dart';
import '../cart_controller.dart';

class CartSummarySection extends StatelessWidget {
  final List<CartLine> lines;
  final Product Function(int productId) getProductById;
  final int cartItemCount;
  final double cartSubtotal;
  final void Function(int lineId) onIncreaseQty;
  final void Function(int lineId) onDecreaseQty;
  final void Function(int lineId, String? notes) onSetNotes;
  final VoidCallback onClearCart;
  final VoidCallback onCheckoutTap;

  const CartSummarySection({
    super.key,
    required this.lines,
    required this.getProductById,
    required this.cartItemCount,
    required this.cartSubtotal,
    required this.onIncreaseQty,
    required this.onDecreaseQty,
    required this.onSetNotes,
    required this.onClearCart,
    required this.onCheckoutTap,
  });

  Future<void> _editNotes(BuildContext context, CartLine line) async {
    final controller = TextEditingController(text: line.notes ?? '');

    final result = await showDialog<String?>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text('Special request — ${getProductById(line.productId).name}'),
          content: SizedBox(
            width: 420,
            child: TextField(
              controller: controller,
              autofocus: true,
              maxLength: 255,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'e.g. no onions, extra spicy',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(controller.text),
              child: const Text('Save'),
            ),
          ],
        );
      },
    );

    if (result != null) {
      onSetNotes(line.id, result);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SectionContainer(
      sectionId: 'cart-section',
      title: 'Cart summary',
      subtitle:
          'A good ordering flow keeps item count, subtotal, and quantity controls visible before checkout.',
      child: lines.isEmpty
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
                ...lines.map((line) {
                  final product = getProductById(line.productId);
                  // Unit price includes any modifier upcharges.
                  final unit =
                      line.unitPrice > 0 ? line.unitPrice : product.price;
                  final lineTotal = unit * line.quantity;

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
                        child: Column(
                          children: [
                            Row(
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
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
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
                                        '\$${unit.toStringAsFixed(2)} each',
                                        style: const TextStyle(
                                          color: Color(0xFF625D5A),
                                        ),
                                      ),
                                      if (line.modifierLabel != null)
                                        Text(
                                          line.modifierLabel!,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: Colors.deepOrange,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  onPressed: () => onDecreaseQty(line.id),
                                  icon: const Icon(Icons.remove_circle_outline),
                                ),
                                Text(
                                  '${line.quantity}',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                IconButton(
                                  onPressed: () => onIncreaseQty(line.id),
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
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () => _editNotes(context, line),
                                icon: Icon(
                                  line.notes == null
                                      ? Icons.note_add_outlined
                                      : Icons.edit_note,
                                  size: 18,
                                ),
                                label: Text(
                                  line.notes == null
                                      ? 'Add special request'
                                      : line.notes!,
                                  style: const TextStyle(fontSize: 13),
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
