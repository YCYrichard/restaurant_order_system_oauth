class ModifierOption {
  final int id;
  final String name;
  final double priceDelta;

  const ModifierOption({
    required this.id,
    required this.name,
    required this.priceDelta,
  });

  factory ModifierOption.fromJson(Map<String, dynamic> json) {
    return ModifierOption(
      id: int.parse(json['id'].toString()),
      name: json['name']?.toString() ?? '',
      priceDelta: double.tryParse(json['price_delta'].toString()) ?? 0,
    );
  }
}

class ModifierGroup {
  final int id;
  final String name;
  final int minSelect;
  final int maxSelect;
  final bool isRequired;
  final List<ModifierOption> options;

  const ModifierGroup({
    required this.id,
    required this.name,
    required this.minSelect,
    required this.maxSelect,
    required this.isRequired,
    required this.options,
  });

  /// A group that allows only one choice renders as radio buttons; more than
  /// one, as checkboxes.
  bool get isSingleChoice => maxSelect == 1;

  factory ModifierGroup.fromJson(Map<String, dynamic> json) {
    final rawOptions = json['options'];

    return ModifierGroup(
      id: int.parse(json['id'].toString()),
      name: json['name']?.toString() ?? '',
      minSelect: int.tryParse(json['min_select'].toString()) ?? 0,
      maxSelect: int.tryParse(json['max_select'].toString()) ?? 1,
      isRequired:
          json['is_required'] == 1 || json['is_required'] == true,
      options: rawOptions is List
          ? rawOptions
              .whereType<Map>()
              .map((o) => ModifierOption.fromJson(Map<String, dynamic>.from(o)))
              .toList()
          : const [],
    );
  }
}

class Product {
  final int id;
  final int storeId;
  final int? categoryId;
  final String? categoryName;
  final String name;
  final String? description;
  final double price;
  final String? imageUrl;
  final List<ModifierGroup> modifierGroups;

  const Product({
    required this.id,
    required this.storeId,
    this.categoryId,
    this.categoryName,
    required this.name,
    this.description,
    required this.price,
    this.imageUrl,
    this.modifierGroups = const [],
  });

  bool get hasModifiers => modifierGroups.isNotEmpty;

  /// True when the customer must make a choice before this can be added,
  /// which is what decides between "add straight to cart" and "open the
  /// option picker".
  bool get requiresChoice =>
      modifierGroups.any((group) => group.isRequired || group.minSelect > 0);

  factory Product.fromJson(Map<String, dynamic> json) {
    final rawGroups = json['modifier_groups'];
    final rawImage = json['image_url']?.toString();

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
      imageUrl: rawImage == null || rawImage.isEmpty ? null : rawImage,
      modifierGroups: rawGroups is List
          ? rawGroups
              .whereType<Map>()
              .map((g) => ModifierGroup.fromJson(Map<String, dynamic>.from(g)))
              .toList()
          : const [],
    );
  }
}
