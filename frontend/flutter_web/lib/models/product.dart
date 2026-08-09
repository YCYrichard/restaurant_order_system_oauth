class Product {
  final int id;
  final int storeId;
  final int? categoryId;
  final String? categoryName;
  final String name;
  final String? description;
  final double price;

  const Product({
    required this.id,
    required this.storeId,
    this.categoryId,
    this.categoryName,
    required this.name,
    this.description,
    required this.price,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: int.parse(json['id'].toString()),
      storeId: int.parse(json['store_id'].toString()),
      categoryId: json['category_id'] == null
          ? null
          : int.parse(json['category_id'].toString()),
      categoryName: json['category_name']?.toString(),
      name: json['name']?.toString() ?? '',
      description: json['description']?.toString(),
      price: double.tryParse(json['price'].toString()) ?? 0,
    );
  }
}
