import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// Shared card-style wrapper used by every landing-page section
/// (login, store picker, menu, cart, steps). Handles the optional
/// scroll-anchor id used by the top nav's "scroll to section" buttons.
class SectionContainer extends StatelessWidget {
  final String? sectionId;
  final String title;
  final String subtitle;
  final Widget child;

  const SectionContainer({
    super.key,
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
                            web.document.getElementById(sectionId!);
                        if (element == null) {
                          final hostElement =
                              web.document.querySelector('[flt-glass-pane]');
                          if (hostElement != null) {
                            final anchor = web.document.createElement('div');
                            anchor.id = sectionId!;
                            hostElement.appendChild(anchor);
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
