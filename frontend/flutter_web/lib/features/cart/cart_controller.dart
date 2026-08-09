import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

import '../../models/product.dart';

class CartController extends ChangeNotifier {
  static const _storageKey = 'cart_items';

  final Map<int, int> _items = {};

  CartController() {
    _restoreFromStorage();
  }

  Map<int, int> get items => Map.unmodifiable(_items);

  int get itemCount => _items.values.fold(0, (sum, qty) => sum + qty);

  bool get isEmpty => _items.isEmpty;

  void _restoreFromStorage() {
    final stored = web.window.localStorage.getItem(_storageKey);

    if (stored == null || stored.isEmpty) return;

    try {
      final decoded = jsonDecode(stored);

      if (decoded is Map) {
        decoded.forEach((key, value) {
          final productId = int.tryParse(key.toString());
          final quantity = int.tryParse(value.toString());

          if (productId != null && quantity != null && quantity > 0) {
            _items[productId] = quantity;
          }
        });
      }
    } catch (_) {
      // Corrupt or old-format data - start with an empty cart.
    }
  }

  void _persist() {
    web.window.localStorage.setItem(
      _storageKey,
      jsonEncode(_items.map((key, value) => MapEntry(key.toString(), value))),
    );
  }

  void add(Product product) {
    _items.update(product.id, (value) => value + 1, ifAbsent: () => 1);
    _persist();
    notifyListeners();
  }

  void increase(int productId) {
    _items.update(productId, (value) => value + 1);
    _persist();
    notifyListeners();
  }

  void decrease(int productId) {
    if (!_items.containsKey(productId)) return;

    final current = _items[productId]!;

    if (current <= 1) {
      _items.remove(productId);
    } else {
      _items[productId] = current - 1;
    }

    _persist();
    notifyListeners();
  }

  /// Drops a single entry outright, regardless of quantity. Used to reconcile
  /// a persisted cart against a freshly loaded product list (e.g. on
  /// checkout reload) when an item no longer belongs to the current store.
  void remove(int productId) {
    if (!_items.containsKey(productId)) return;

    _items.remove(productId);
    _persist();
    notifyListeners();
  }

  void clear() {
    _items.clear();
    _persist();
    notifyListeners();
  }

  double subtotal(Product Function(int productId) getProductById) {
    double total = 0;

    for (final entry in _items.entries) {
      total += getProductById(entry.key).price * entry.value;
    }

    return total;
  }
}
