import 'package:flutter/material.dart';

/// Identity banner for the store this page is loaded for - name, open/closed
/// state, today's hours, and contact details. Every field comes from the
/// store record itself; nothing here is decorative placeholder content.
class StoreHeaderSection extends StatelessWidget {
  final String name;
  final String? address;
  final String? phone;
  final bool isOpen;
  final String? closedReason;
  final String? todayHours;

  const StoreHeaderSection({
    super.key,
    required this.name,
    this.address,
    this.phone,
    required this.isOpen,
    this.closedReason,
    this.todayHours,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFFF0E8), Color(0xFFFFFBF7)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(28),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.deepOrange,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.restaurant_menu, color: Colors.white),
                ),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Flexible(
                            child: Text(
                              name,
                              style: const TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF1C1B1A),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: isOpen
                                  ? Colors.green.withValues(alpha: 0.12)
                                  : Colors.red.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              isOpen ? 'OPEN' : 'CLOSED',
                              style: TextStyle(
                                color: isOpen
                                    ? Colors.green.shade800
                                    : Colors.red.shade700,
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (!isOpen && closedReason != null)
                        Text(
                          closedReason!,
                          style: TextStyle(
                            color: Colors.red.shade700,
                            fontWeight: FontWeight.w600,
                          ),
                        )
                      else if (isOpen && todayHours != null)
                        Text(
                          'Open today $todayHours',
                          style: const TextStyle(color: Color(0xFF5F5A57)),
                        ),
                      if (address != null && address!.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          address!,
                          style: const TextStyle(
                            color: Color(0xFF625D5A),
                            fontSize: 13,
                          ),
                        ),
                      ],
                      if (phone != null && phone!.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          phone!,
                          style: const TextStyle(
                            color: Color(0xFF625D5A),
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
