import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

import '../../models/product.dart';

/// One cart line. Lines are keyed by a synthetic [id] rather than by
/// productId, because the same product can appear more than once with
/// different notes ("no onions" vs. "extra sauce").
class CartLine {
  final int id;
  final int productId;
  final int quantity;
  final String? notes;

  /// Chosen modifier option ids. Only ids travel to the server, which looks
  /// up the real price deltas - the same rule as base prices.
  final List<int> modifierOptionIds;

  /// Human-readable summary ("Size: Large") and the unit price including
  /// deltas, both captured when the line was added. These are for display
  /// only; the server recomputes the authoritative figures at checkout.
  final String? modifierLabel;
  final double unitPrice;

  const CartLine({
    required this.id,
    required this.productId,
    required this.quantity,
    required this.unitPrice,
    this.notes,
    this.modifierOptionIds = const [],
    this.modifierLabel,
  });

  CartLine copyWith({int? quantity, String? notes, bool clearNotes = false}) {
    return CartLine(
      id: id,
      productId: productId,
      quantity: quantity ?? this.quantity,
      unitPrice: unitPrice,
      notes: clearNotes ? null : (notes ?? this.notes),
      modifierOptionIds: modifierOptionIds,
      modifierLabel: modifierLabel,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'productId': productId,
        'quantity': quantity,
        'notes': notes,
        'unitPrice': unitPrice,
        'modifierOptionIds': modifierOptionIds,
        'modifierLabel': modifierLabel,
      };

  static CartLine? fromJson(Map<dynamic, dynamic> json) {
    final id = int.tryParse(json['id'].toString());
    final productId = int.tryParse(json['productId'].toString());
    final quantity = int.tryParse(json['quantity'].toString());

    if (id == null || productId == null || quantity == null || quantity <= 0) {
      return null;
    }

    final notes = json['notes']?.toString();
    final rawIds = json['modifierOptionIds'];
    final label = json['modifierLabel']?.toString();

    return CartLine(
      id: id,
      productId: productId,
      quantity: quantity,
      unitPrice: double.tryParse(json['unitPrice'].toString()) ?? 0,
      notes: notes == null || notes.isEmpty ? null : notes,
      modifierOptionIds: rawIds is List
          ? rawIds.map((v) => int.tryParse(v.toString())).whereType<int>().toList()
          : const [],
      modifierLabel: label == null || label.isEmpty ? null : label,
    );
  }
}

class CartController extends ChangeNotifier {
  static const _storageKey = 'cart_lines';

  final List<CartLine> _lines = [];
  int _nextLineId = 1;

  CartController() {
    _restoreFromStorage();
  }

  List<CartLine> get lines => List.unmodifiable(_lines);

  int get itemCount => _lines.fold(0, (sum, line) => sum + line.quantity);

  bool get isEmpty => _lines.isEmpty;

  /// Total quantity of a product across all its lines - used for the
  /// "in cart: N" badge on menu cards, which is per-product, not per-line.
  Map<int, int> get quantitiesByProduct {
    final quantities = <int, int>{};

    for (final line in _lines) {
      quantities.update(
        line.productId,
        (value) => value + line.quantity,
        ifAbsent: () => line.quantity,
      );
    }

    return quantities;
  }

  void _restoreFromStorage() {
    final stored = web.window.localStorage.getItem(_storageKey);

    if (stored == null || stored.isEmpty) return;

    try {
      final decoded = jsonDecode(stored);

      if (decoded is List) {
        for (final entry in decoded) {
          if (entry is Map) {
            final line = CartLine.fromJson(entry);
            if (line != null) _lines.add(line);
          }
        }
      }

      _nextLineId = _lines.isEmpty
          ? 1
          : _lines.map((line) => line.id).reduce((a, b) => a > b ? a : b) + 1;
    } catch (_) {
      // Corrupt or old-format data (the cart used to be a productId->qty
      // map) - start clean rather than trying to migrate it.
      _lines.clear();
      _nextLineId = 1;
    }
  }

  void _persist() {
    web.window.localStorage.setItem(
      _storageKey,
      jsonEncode(_lines.map((line) => line.toJson()).toList()),
    );
  }

  int _indexOfLine(int lineId) =>
      _lines.indexWhere((line) => line.id == lineId);

  /// Adds one of [product] with the given option choices.
  ///
  /// Merges into an existing line only when the notes AND the option
  /// selection both match - "large, no onions" is a different line from
  /// "regular", so bumping quantity across them would be wrong.
  void add(Product product, {List<ModifierOption> options = const []}) {
    final optionIds = options.map((o) => o.id).toList()..sort();
    final unitPrice = product.price +
        options.fold<double>(0, (sum, option) => sum + option.priceDelta);
    final label = options.isEmpty
        ? null
        : options.map((o) => o.name).join(', ');

    final existingIndex = _lines.indexWhere(
      (line) =>
          line.productId == product.id &&
          line.notes == null &&
          _sameSelection(line.modifierOptionIds, optionIds),
    );

    if (existingIndex == -1) {
      _lines.add(
        CartLine(
          id: _nextLineId++,
          productId: product.id,
          quantity: 1,
          unitPrice: unitPrice,
          modifierOptionIds: optionIds,
          modifierLabel: label,
        ),
      );
    } else {
      final existing = _lines[existingIndex];
      _lines[existingIndex] =
          existing.copyWith(quantity: existing.quantity + 1);
    }

    _persist();
    notifyListeners();
  }

  bool _sameSelection(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  void increase(int lineId) {
    final index = _indexOfLine(lineId);
    if (index == -1) return;

    _lines[index] = _lines[index].copyWith(
      quantity: _lines[index].quantity + 1,
    );

    _persist();
    notifyListeners();
  }

  void decrease(int lineId) {
    final index = _indexOfLine(lineId);
    if (index == -1) return;

    final current = _lines[index];

    if (current.quantity <= 1) {
      _lines.removeAt(index);
    } else {
      _lines[index] = current.copyWith(quantity: current.quantity - 1);
    }

    _persist();
    notifyListeners();
  }

  void setNotes(int lineId, String? notes) {
    final index = _indexOfLine(lineId);
    if (index == -1) return;

    final trimmed = notes?.trim();
    final isEmpty = trimmed == null || trimmed.isEmpty;

    _lines[index] = _lines[index].copyWith(
      notes: isEmpty ? null : trimmed,
      clearNotes: isEmpty,
    );

    _persist();
    notifyListeners();
  }

  void removeLine(int lineId) {
    final index = _indexOfLine(lineId);
    if (index == -1) return;

    _lines.removeAt(index);
    _persist();
    notifyListeners();
  }

  /// Drops every line for a product. Used to reconcile a persisted cart
  /// against a freshly loaded product list (e.g. on checkout reload) when an
  /// item no longer belongs to the current store.
  void removeProduct(int productId) {
    _lines.removeWhere((line) => line.productId == productId);
    _persist();
    notifyListeners();
  }

  void clear() {
    _lines.clear();
    _persist();
    notifyListeners();
  }

  /// Uses each line's captured unit price so modifier upcharges are
  /// included. Falls back to the catalogue price for lines saved before
  /// unit prices were stored.
  double subtotal(Product Function(int productId) getProductById) {
    double total = 0;

    for (final line in _lines) {
      final unit = line.unitPrice > 0
          ? line.unitPrice
          : getProductById(line.productId).price;
      total += unit * line.quantity;
    }

    return total;
  }
}
