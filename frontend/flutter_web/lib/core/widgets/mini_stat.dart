import 'package:flutter/material.dart';

/// Small boxed stat used in the hero section (e.g. "3 Providers").
class MiniStat extends StatelessWidget {
  final String label;
  final String value;

  const MiniStat({super.key, required this.label, required this.value});

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
