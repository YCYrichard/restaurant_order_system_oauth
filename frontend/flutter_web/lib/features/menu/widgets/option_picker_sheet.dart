import 'package:flutter/material.dart';

import '../../../models/product.dart';

/// Choice sheet shown before a product with modifier groups goes into the
/// cart. Single-choice groups render as radios, multi-choice as checkboxes,
/// and the confirm button stays disabled until every required group is
/// satisfied - the same rules the server enforces, surfaced early so the
/// customer isn't rejected at checkout.
class OptionPickerSheet extends StatefulWidget {
  final Product product;

  const OptionPickerSheet({super.key, required this.product});

  @override
  State<OptionPickerSheet> createState() => _OptionPickerSheetState();
}

class _OptionPickerSheetState extends State<OptionPickerSheet> {
  /// groupId -> chosen option ids.
  final Map<int, Set<int>> _selection = {};

  @override
  void initState() {
    super.initState();

    for (final group in widget.product.modifierGroups) {
      _selection[group.id] = <int>{};

      // Pre-select the first option of a required single-choice group so the
      // common case is one tap, not two.
      if (group.isRequired && group.isSingleChoice && group.options.isNotEmpty) {
        _selection[group.id]!.add(group.options.first.id);
      }
    }
  }

  List<ModifierOption> get _chosenOptions {
    final chosen = <ModifierOption>[];

    for (final group in widget.product.modifierGroups) {
      for (final option in group.options) {
        if (_selection[group.id]?.contains(option.id) ?? false) {
          chosen.add(option);
        }
      }
    }

    return chosen;
  }

  bool get _isValid {
    for (final group in widget.product.modifierGroups) {
      final count = _selection[group.id]?.length ?? 0;

      if (group.isRequired && count < 1) return false;
      if (count < group.minSelect) return false;
      if (count > group.maxSelect) return false;
    }

    return true;
  }

  double get _unitPrice =>
      widget.product.price +
      _chosenOptions.fold<double>(0, (sum, o) => sum + o.priceDelta);

  void _toggle(ModifierGroup group, ModifierOption option) {
    setState(() {
      final selected = _selection[group.id]!;

      if (group.isSingleChoice) {
        selected
          ..clear()
          ..add(option.id);
        return;
      }

      if (selected.contains(option.id)) {
        selected.remove(option.id);
      } else if (selected.length < group.maxSelect) {
        selected.add(option.id);
      } else {
        // At the cap - say so rather than silently ignoring the tap.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${group.name} allows at most ${group.maxSelect}.'),
            duration: const Duration(seconds: 2),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.product.name),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.product.description != null &&
                  widget.product.description!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    widget.product.description!,
                    style: const TextStyle(color: Color(0xFF625D5A)),
                  ),
                ),
              ...widget.product.modifierGroups.map(_buildGroup),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _isValid
              ? () => Navigator.of(context).pop(_chosenOptions)
              : null,
          child: Text('Add · \$${_unitPrice.toStringAsFixed(2)}'),
        ),
      ],
    );
  }

  Widget _buildGroup(ModifierGroup group) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Row(
            children: [
              Text(
                group.name,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: 8),
              Text(
                group.isRequired
                    ? 'Required'
                    : group.maxSelect > 1
                        ? 'Choose up to ${group.maxSelect}'
                        : 'Optional',
                style: TextStyle(
                  fontSize: 11,
                  color: group.isRequired
                      ? Colors.deepOrange
                      : const Color(0xFF77716D),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        ...group.options.map((option) {
          final selected = _selection[group.id]?.contains(option.id) ?? false;
          final delta = option.priceDelta == 0
              ? ''
              : ' (+\$${option.priceDelta.toStringAsFixed(2)})';

          return InkWell(
            onTap: () => _toggle(group, option),
            child: Row(
              children: [
                // The whole row is tappable, so these are indicators rather
                // than separate controls. Radio's groupValue/onChanged are
                // deprecated in this Flutter version, and an icon sidesteps
                // that without needing a RadioGroup ancestor.
                group.isSingleChoice
                    ? Padding(
                        padding: const EdgeInsets.all(12),
                        child: Icon(
                          selected
                              ? Icons.radio_button_checked
                              : Icons.radio_button_unchecked,
                          size: 20,
                          color: selected ? Colors.deepOrange : Colors.grey,
                        ),
                      )
                    : Checkbox(
                        value: selected,
                        onChanged: (_) => _toggle(group, option),
                      ),
                Expanded(child: Text('${option.name}$delta')),
              ],
            ),
          );
        }),
      ],
    );
  }
}
