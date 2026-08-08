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

                      return _StoreCard(
                        name: store['name']?.toString() ?? 'Unnamed store',
                        address: store['address']?.toString(),
                        phone: store['phone']?.toString(),
                        isSelected: isSelected,
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
  final VoidCallback? onTap;

  const _StoreCard({
    required this.name,
    required this.address,
    required this.phone,
    required this.isSelected,
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
                    Text(
                      name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
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
