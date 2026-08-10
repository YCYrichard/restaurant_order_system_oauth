import 'package:flutter/material.dart';

/// "Ready by" chip picker - ASAP plus the store's own offered slots for the
/// rest of today. Purely a display/selection widget: slot generation and
/// the actual enforcement both happen server-side (store-hours.service.js
/// getPickupSlots and orders.service.js resolveDesiredReadyAt) - this only
/// has to offer choices the server already agrees are valid.
class PickupTimeSelector extends StatelessWidget {
  final Map<String, dynamic>? pickupSlots;
  final bool loading;

  /// Null selection means ASAP.
  final String? selectedReadyAt;
  final ValueChanged<String?> onSelect;

  const PickupTimeSelector({
    super.key,
    required this.pickupSlots,
    required this.loading,
    required this.selectedReadyAt,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    final data = pickupSlots;

    // No opinion when the store isn't currently open at all - the store's
    // closed state is already surfaced elsewhere (StoreHeaderSection,
    // and createOrder rejects the order outright), so this would only
    // duplicate that message.
    if (data == null || data['isOpen'] == false) {
      return const SizedBox.shrink();
    }

    final slots = data['slots'] is List
        ? List<Map<String, dynamic>>.from(
            (data['slots'] as List)
                .whereType<Map>()
                .map((s) => Map<String, dynamic>.from(s)),
          )
        : const <Map<String, dynamic>>[];
    final minPrepMinutes = data['minPrepMinutes'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Ready by',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            ChoiceChip(
              label: Text(
                minPrepMinutes != null
                    ? 'ASAP (~$minPrepMinutes min)'
                    : 'ASAP',
              ),
              selected: selectedReadyAt == null,
              onSelected: (_) => onSelect(null),
            ),
            ...slots.map((slot) {
              final readyAt = slot['readyAt']?.toString();
              return ChoiceChip(
                label: Text('${slot['label']}'),
                selected: selectedReadyAt != null && selectedReadyAt == readyAt,
                onSelected: readyAt == null ? null : (_) => onSelect(readyAt),
              );
            }),
          ],
        ),
        if (slots.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'No later pickup times today - ASAP is the only option left.',
              style: TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
            ),
          ),
      ],
    );
  }
}
