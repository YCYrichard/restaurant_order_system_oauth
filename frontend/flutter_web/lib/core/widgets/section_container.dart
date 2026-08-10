import 'package:flutter/material.dart';

/// Shared card-style wrapper used by page sections that want a title,
/// subtitle, and a consistent rounded card frame around their content.
class SectionContainer extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;

  const SectionContainer({
    super.key,
    required this.title,
    required this.subtitle,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
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
