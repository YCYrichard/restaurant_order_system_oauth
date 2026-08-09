import '../../../core/api/api_client.dart';
import '../../../models/product.dart';

class MenuRepository {
  static Future<List<Product>> fetchProducts(int storeId) async {
    final decoded = await ApiClient.getJson('/products/store/$storeId/public');

    final list = (decoded is Map && decoded['products'] is List)
        ? decoded['products'] as List
        : const [];

    return list
        .whereType<Map>()
        .map((item) => Product.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }
}
