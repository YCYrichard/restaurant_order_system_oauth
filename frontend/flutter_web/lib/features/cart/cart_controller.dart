import 'package:flutter/foundation.dart';

import '../../models/product.dart';

class CartController extends ChangeNotifier {
  final Map<int, int> _items = {};

  Map<int, int> get items => Map.unmodifiable(_items);

  int get itemCount => _items.values.fold(0, (sum, qty) => sum + qty);

  bool get isEmpty => _items.isEmpty;

  void add(Product product) {
    _items.update(product.id, (value) => value + 1, ifAbsent: () => 1);
    notifyListeners();
  }

  void increase(int productId) {
    _items.update(productId, (value) => value + 1);
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

    notifyListeners();
  }

  void clear() {
    _items.clear();
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
