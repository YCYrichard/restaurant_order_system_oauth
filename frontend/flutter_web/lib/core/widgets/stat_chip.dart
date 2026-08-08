import 'package:flutter/material.dart';

/// Unboxed label/value stat used in cart and order summaries.
/// (Was duplicated as _CartStat in main.dart and _SummaryStat in
/// checkout_page.dart — consolidated here as a single shared widget.)
class StatChip extends StatelessWidget {
  final String label;
  final String value;

  const StatChip({super.key, required this.label, required this.value});

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
