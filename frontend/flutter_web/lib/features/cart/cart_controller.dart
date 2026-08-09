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

  const CartLine({
    required this.id,
    required this.productId,
    required this.quantity,
    this.notes,
  });

  CartLine copyWith({int? quantity, String? notes, bool clearNotes = false}) {
    return CartLine(
      id: id,
      productId: productId,
      quantity: quantity ?? this.quantity,
      notes: clearNotes ? null : (notes ?? this.notes),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'productId': productId,
        'quantity': quantity,
        'notes': notes,
      };

  static CartLine? fromJson(Map<dynamic, dynamic> json) {
    final id = int.tryParse(json['id'].toString());
    final productId = int.tryParse(json['productId'].toString());
    final quantity = int.tryParse(json['quantity'].toString());

    if (id == null || productId == null || quantity == null || quantity <= 0) {
      return null;
    }

    final notes = json['notes']?.toString();

    return CartLine(
      id: id,
      productId: productId,
      quantity: quantity,
      notes: notes == null || notes.isEmpty ? null : notes,
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

  /// Adds one of [product]. Merges into an existing note-free line for the
  /// same product so repeated taps bump quantity rather than stacking
  /// duplicate rows; lines that carry notes are left alone.
  void add(Product product) {
    final existingIndex = _lines.indexWhere(
      (line) => line.productId == product.id && line.notes == null,
    );

    if (existingIndex == -1) {
      _lines.add(
        CartLine(id: _nextLineId++, productId: product.id, quantity: 1),
      );
    } else {
      final existing = _lines[existingIndex];
      _lines[existingIndex] =
          existing.copyWith(quantity: existing.quantity + 1);
    }

    _persist();
    notifyListeners();
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

  double subtotal(Product Function(int productId) getProductById) {
    double total = 0;

    for (final line in _lines) {
      total += getProductById(line.productId).price * line.quantity;
    }

    return total;
  }
}
