import 'package:flutter/material.dart';

import '../../../core/widgets/section_container.dart';

class StoreSelectorSection extends StatelessWidget {
  final List<Map<String, dynamic>> stores;
  final int? selectedStoreId;
  final bool isLoading;
  final void Function(int storeId) onSelectStore;

  const StoreSelectorSection({
    super.key,
    required this.stores,
    required this.selectedStoreId,
    required this.isLoading,
    required this.onSelectStore,
  });

  @override
  Widget build(BuildContext context) {
    return SectionContainer(
      sectionId: 'store-section',
      title: 'Choose a store',
      subtitle:
          'Pick which store location you want to order from. Your order will be sent to that store.',
      child: isLoading
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            )
          : stores.isEmpty
              ? Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF7F7F7),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'No stores are available for ordering right now.',
                    style: TextStyle(color: Color(0xFF625D5A)),
                  ),
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth > 700;

                    final cards = stores.map((store) {
                      final storeId = int.tryParse(store['id'].toString());
                      final isSelected =
                          storeId != null && storeId == selectedStoreId;

                      // Backend defaults is_open to true when a store has
                      // no hours configured, so an older payload without the
                      // field must not read as closed.
                      final isOpen = store['is_open'] != false;

                      return _StoreCard(
                        name: store['name']?.toString() ?? 'Unnamed store',
                        address: store['address']?.toString(),
                        phone: store['phone']?.toString(),
                        isSelected: isSelected,
                        isOpen: isOpen,
                        closedReason: store['closed_reason']?.toString(),
                        todayHours: store['today_hours'] is Map
                            ? '${store['today_hours']['open']}-${store['today_hours']['close']}'
                            : null,
                        onTap: storeId == null
                            ? null
                            : () => onSelectStore(storeId),
                      );
                    }).toList();

                    if (isWide) {
                      return Row(
                        children: cards
                            .map(
                              (card) => Expanded(
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(horizontal: 8),
                                  child: card,
                                ),
                              ),
                            )
                            .toList(),
                      );
                    }

                    return Column(
                      children: cards
                          .map(
                            (card) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: card,
                            ),
                          )
                          .toList(),
                    );
                  },
                ),
    );
  }
}

class _StoreCard extends StatelessWidget {
  final String name;
  final String? address;
  final String? phone;
  final bool isSelected;
  final bool isOpen;
  final String? closedReason;
  final String? todayHours;
  final VoidCallback? onTap;

  const _StoreCard({
    required this.name,
    required this.address,
    required this.phone,
    required this.isSelected,
    required this.isOpen,
    required this.closedReason,
    required this.todayHours,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: isSelected ? const Color(0xFFFFF3EB) : Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(
          color: isSelected ? Colors.deepOrange : const Color(0xFFEDEDED),
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: isSelected
                    ? Colors.deepOrange.withValues(alpha: 0.14)
                    : Colors.orange.withValues(alpha: 0.12),
                child: Icon(
                  Icons.store,
                  color: isSelected ? Colors.deepOrange : Colors.deepOrange,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
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
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (!isOpen && closedReason != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        closedReason!,
                        style: TextStyle(
                          color: Colors.red.shade700,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ] else if (isOpen && todayHours != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        'Today $todayHours',
                        style: const TextStyle(
                          color: Color(0xFF77716D),
                          fontSize: 12,
                        ),
                      ),
                    ],
                    if (address != null && address!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        address!,
                        style: const TextStyle(
                          color: Color(0xFF625D5A),
                          height: 1.4,
                        ),
                      ),
                    ],
                    if (phone != null && phone!.isNotEmpty) ...[
                      const SizedBox(height: 4),
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
              if (isSelected)
                const Icon(Icons.check_circle, color: Colors.deepOrange),
            ],
          ),
        ),
      ),
    );
  }
}
