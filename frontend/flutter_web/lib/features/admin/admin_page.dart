import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/constants/app_config.dart';
import 'widgets/coupons_panel.dart';
import 'widgets/modifiers_panel.dart';
import 'widgets/orders_panel.dart';
import 'widgets/reports_panel.dart';
import 'widgets/store_hours_panel.dart';
import 'widgets/table_qr_panel.dart';
import 'widgets/users_panel.dart';

class AdminPage extends StatefulWidget {
  const AdminPage({super.key});

  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminTab {
  final String title;
  final IconData icon;
  final Widget content;

  const _AdminTab({
    required this.title,
    required this.icon,
    required this.content,
  });
}

class _AdminPageState extends State<AdminPage> {
  List<Map<String, dynamic>> stores = [];
  List<Map<String, dynamic>> products = [];
  List<Map<String, dynamic>> categories = [];

  Map<String, dynamic>? selectedStore;

  bool _loadingStores = false;
  bool _loadingProducts = false;
  bool _loadingCategories = false;
  bool _savingStore = false;
  bool _savingProduct = false;
  bool _savingCategory = false;

  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _loadStores();
  }

  AuthController get _auth => context.read<AuthController>();

  String? get _token => _auth.token;

  Map<String, String> _headers({
    bool json = false,
  }) {
    final token = _token;

    final headers = <String, String>{
      'Accept': 'application/json',
    };

    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    if (json) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  bool _isUnauthorized(int? status) {
    return status == 401 || status == 403;
  }

  void _showMessage(
    String message, {
    bool isError = false,
  }) {
    if (!mounted) return;

    setState(() {
      _message = message;
      _messageIsError = isError;
    });
  }

  void _clearMessage() {
    if (!mounted) return;

    setState(() {
      _message = null;
      _messageIsError = false;
    });
  }

  // Tries a silent token refresh first - a plain expired 15-minute access
  // token shouldn't force a full re-login. Only clears the session and
  // returns to the login screen if the refresh token itself is invalid,
  // expired, or revoked.
  Future<void> _handleUnauthorized() async {
    final refreshed = await _auth.refresh();

    if (refreshed) {
      _showMessage(
        'Your session was refreshed. Please try that action again.',
      );
      return;
    }

    // The router's redirect logic sends the user to /admin/login on its own
    // once AuthController notifies listeners that the session is gone.
    await _auth.logout();
  }

  Map<String, dynamic> _decodeMap(String responseText) {
    final decoded = jsonDecode(responseText);

    if (decoded is Map<String, dynamic>) {
      return decoded;
    }

    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _decodeList(
    String responseText,
    String key,
  ) {
    final decoded = _decodeMap(responseText);
    final value = decoded[key];

    if (value is! List) {
      return [];
    }

    return value
        .whereType<Map>()
        .map(
          (item) => Map<String, dynamic>.from(item),
        )
        .toList();
  }

  Future<void> _loadStores() async {
    if (_token == null || _token!.isEmpty) {
      await _handleUnauthorized();
      return;
    }

    setState(() {
      _loadingStores = true;
    });

    try {
      final response = await http.get(
        Uri.parse('$apiBaseUrl/stores'),
        headers: _headers(),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to load stores: ${response.body}',
          isError: true,
        );
        return;
      }

      final loadedStores = _decodeList(
        response.body,
        'stores',
      );

      Map<String, dynamic>? nextSelectedStore;

      if (loadedStores.isNotEmpty) {
        if (selectedStore != null) {
          final selectedId = selectedStore!['id'];

          for (final store in loadedStores) {
            if (store['id'] == selectedId) {
              nextSelectedStore = store;
              break;
            }
          }
        }

        nextSelectedStore ??= loadedStores.first;
      }

      setState(() {
        stores = loadedStores;
        selectedStore = nextSelectedStore;
        _loadingStores = false;
      });

      if (selectedStore != null) {
        await Future.wait([
          _loadProductsForSelectedStore(),
          _loadCategoriesForSelectedStore(),
        ]);
      } else {
        setState(() {
          products = [];
          categories = [];
          _loadingProducts = false;
          _loadingCategories = false;
        });
      }
    } catch (error) {
      setState(() {
        _loadingStores = false;
      });

      _showMessage(
        'Network error while loading stores: $error',
        isError: true,
      );
    }
  }

  Future<void> _loadCategoriesForSelectedStore() async {
    if (selectedStore == null) {
      setState(() {
        categories = [];
      });
      return;
    }

    final storeId = selectedStore!['id'];

    if (storeId == null) {
      return;
    }

    setState(() {
      _loadingCategories = true;
    });

    try {
      final response = await http.get(
        Uri.parse('$apiBaseUrl/categories/store/$storeId'),
        headers: _headers(),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to load categories: ${response.body}',
          isError: true,
        );
        setState(() {
          _loadingCategories = false;
        });
        return;
      }

      final loadedCategories = _decodeList(
        response.body,
        'categories',
      );

      setState(() {
        categories = loadedCategories;
        _loadingCategories = false;
      });
    } catch (error) {
      setState(() {
        _loadingCategories = false;
      });

      _showMessage(
        'Network error while loading categories: $error',
        isError: true,
      );
    }
  }

  Future<void> _createCategory({
    required String name,
    int sortOrder = 0,
  }) async {
    if (selectedStore == null) {
      _showMessage(
        'Select a store first.',
        isError: true,
      );
      return;
    }

    if (name.trim().isEmpty) {
      _showMessage(
        'Category name is required.',
        isError: true,
      );
      return;
    }

    final storeId = selectedStore!['id'];

    setState(() {
      _savingCategory = true;
    });

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/categories/store/$storeId'),
        headers: _headers(json: true),
        body: jsonEncode({
          'name': name.trim(),
          'sortOrder': sortOrder,
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 201) {
        _showMessage(
          'Failed to create category: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage('Category created successfully.');
      await _loadCategoriesForSelectedStore();
    } catch (error) {
      _showMessage(
        'Network error while creating category: $error',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingCategory = false;
        });
      }
    }
  }

  Future<void> _updateCategory({
    required int categoryId,
    required String name,
    int sortOrder = 0,
  }) async {
    if (name.trim().isEmpty) {
      _showMessage(
        'Category name is required.',
        isError: true,
      );
      return;
    }

    setState(() {
      _savingCategory = true;
    });

    try {
      final response = await http.put(
        Uri.parse('$apiBaseUrl/categories/$categoryId'),
        headers: _headers(json: true),
        body: jsonEncode({
          'name': name.trim(),
          'sortOrder': sortOrder,
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to update category: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage('Category updated successfully.');
      await _loadCategoriesForSelectedStore();
    } catch (error) {
      _showMessage(
        'Network error while updating category: $error',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingCategory = false;
        });
      }
    }
  }

  Future<void> _deleteCategory(int categoryId) async {
    try {
      final response = await http.delete(
        Uri.parse('$apiBaseUrl/categories/$categoryId'),
        headers: _headers(json: true),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        final decoded = _decodeMap(response.body);
        _showMessage(
          decoded['message']?.toString() ?? 'Failed to delete category.',
          isError: true,
        );
        return;
      }

      _showMessage('Category deleted.');
      await _loadCategoriesForSelectedStore();
    } catch (error) {
      _showMessage(
        'Network error while deleting category: $error',
        isError: true,
      );
    }
  }

  Future<void> _loadProductsForSelectedStore() async {
    if (selectedStore == null) {
      setState(() {
        products = [];
      });
      return;
    }

    final storeId = selectedStore!['id'];

    if (storeId == null) {
      _showMessage(
        'Selected store does not have a valid ID.',
        isError: true,
      );
      return;
    }

    setState(() {
      _loadingProducts = true;
    });

    try {
      final response = await http.get(
        Uri.parse('$apiBaseUrl/products/store/$storeId'),
        headers: _headers(),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to load products: ${response.body}',
          isError: true,
        );
        return;
      }

      final loadedProducts = _decodeList(
        response.body,
        'products',
      );

      setState(() {
        products = loadedProducts;
        _loadingProducts = false;
      });
    } catch (error) {
      setState(() {
        _loadingProducts = false;
      });

      _showMessage(
        'Network error while loading products: $error',
        isError: true,
      );
    }
  }

  Future<void> _createStore({
    required String name,
    required String address,
    required String phone,
  }) async {
    if (name.trim().isEmpty) {
      _showMessage(
        'Store name is required.',
        isError: true,
      );
      return;
    }

    setState(() {
      _savingStore = true;
    });

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/stores'),
        headers: _headers(json: true),
        body: jsonEncode({
          'name': name.trim(),
          'address': address.trim(),
          'phone': phone.trim(),
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 201) {
        _showMessage(
          'Failed to create store: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage('Store created successfully.');
      await _loadStores();
    } catch (error) {
      _showMessage(
        'Network error while creating store: $error',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingStore = false;
        });
      }
    }
  }

  Future<void> _updateStore({
    required int storeId,
    required String name,
    required String address,
    required String phone,
  }) async {
    if (name.trim().isEmpty) {
      _showMessage(
        'Store name is required.',
        isError: true,
      );
      return;
    }

    setState(() {
      _savingStore = true;
    });

    try {
      final response = await http.put(
        Uri.parse('$apiBaseUrl/stores/$storeId'),
        headers: _headers(json: true),
        body: jsonEncode({
          'name': name.trim(),
          'address': address.trim(),
          'phone': phone.trim(),
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to update store: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage('Store updated successfully.');
      await _loadStores();
    } catch (error) {
      _showMessage(
        'Network error while updating store: $error',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingStore = false;
        });
      }
    }
  }

  Future<void> _updateStoreStatus({
    required int storeId,
    required bool isActive,
  }) async {
    try {
      final response = await http.patch(
        Uri.parse('$apiBaseUrl/stores/$storeId/status'),
        headers: _headers(json: true),
        body: jsonEncode({
          'isActive': isActive,
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to update store status: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage(
        isActive
            ? 'Store activated successfully.'
            : 'Store deactivated successfully.',
      );

      await _loadStores();
    } catch (error) {
      _showMessage(
        'Network error while updating store status: $error',
        isError: true,
      );
    }
  }

  Future<void> _createProduct({
    required String name,
    required String description,
    required double price,
    int? categoryId,
  }) async {
    if (selectedStore == null) {
      _showMessage(
        'Select a store first.',
        isError: true,
      );
      return;
    }

    final storeId = selectedStore!['id'];

    setState(() {
      _savingProduct = true;
    });

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/products/store/$storeId'),
        headers: _headers(json: true),
        body: jsonEncode({
          'name': name.trim(),
          'description': description.trim(),
          'price': price,
          'categoryId': categoryId,
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 201) {
        _showMessage(
          'Failed to create product: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage('Product created successfully.');
      await _loadProductsForSelectedStore();
    } catch (error) {
      _showMessage(
        'Network error while creating product: $error',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingProduct = false;
        });
      }
    }
  }

  Future<void> _updateProduct({
    required int productId,
    required String name,
    required String description,
    required double price,
    int? categoryId,
  }) async {
    setState(() {
      _savingProduct = true;
    });

    try {
      final response = await http.put(
        Uri.parse('$apiBaseUrl/products/$productId'),
        headers: _headers(json: true),
        body: jsonEncode({
          'name': name.trim(),
          'description': description.trim(),
          'price': price,
          'categoryId': categoryId,
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to update product: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage('Product updated successfully.');
      await _loadProductsForSelectedStore();
    } catch (error) {
      _showMessage(
        'Network error while updating product: $error',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingProduct = false;
        });
      }
    }
  }

  Future<void> _updateProductStatus({
    required int productId,
    required bool isActive,
  }) async {
    try {
      final response = await http.patch(
        Uri.parse('$apiBaseUrl/products/$productId/status'),
        headers: _headers(json: true),
        body: jsonEncode({
          'isActive': isActive,
        }),
      );

      if (_isUnauthorized(response.statusCode)) {
        await _handleUnauthorized();
        return;
      }

      if (response.statusCode != 200) {
        _showMessage(
          'Failed to update product status: ${response.body}',
          isError: true,
        );
        return;
      }

      _showMessage(
        isActive
            ? 'Product activated successfully.'
            : 'Product deactivated successfully.',
      );

      await _loadProductsForSelectedStore();
    } catch (error) {
      _showMessage(
        'Network error while updating product status: $error',
        isError: true,
      );
    }
  }

  Future<void> _showCreateStoreDialog() async {
    final nameController = TextEditingController();
    final addressController = TextEditingController();
    final phoneController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Create Store'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(
                      labelText: 'Store name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: addressController,
                    decoration: const InputDecoration(
                      labelText: 'Address',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: phoneController,
                    decoration: const InputDecoration(
                      labelText: 'Phone',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: _savingStore
                  ? null
                  : () async {
                      final name = nameController.text.trim();

                      if (name.isEmpty) {
                        _showMessage(
                          'Store name is required.',
                          isError: true,
                        );
                        return;
                      }

                      Navigator.of(dialogContext).pop();

                      await _createStore(
                        name: name,
                        address: addressController.text,
                        phone: phoneController.text,
                      );
                    },
              child: const Text('Create'),
            ),
          ],
        );
      },
    );

    nameController.dispose();
    addressController.dispose();
    phoneController.dispose();
  }

  Future<void> _showEditStoreDialog(
    Map<String, dynamic> store,
  ) async {
    final storeId = int.tryParse(store['id'].toString());

    if (storeId == null) {
      _showMessage(
        'Invalid store ID.',
        isError: true,
      );
      return;
    }

    final nameController = TextEditingController(
      text: store['name']?.toString() ?? '',
    );

    final addressController = TextEditingController(
      text: store['address']?.toString() ?? '',
    );

    final phoneController = TextEditingController(
      text: store['phone']?.toString() ?? '',
    );

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Edit Store'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(
                      labelText: 'Store name',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: addressController,
                    decoration: const InputDecoration(
                      labelText: 'Address',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: phoneController,
                    decoration: const InputDecoration(
                      labelText: 'Phone',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: _savingStore
                  ? null
                  : () async {
                      final name = nameController.text.trim();

                      if (name.isEmpty) {
                        _showMessage(
                          'Store name is required.',
                          isError: true,
                        );
                        return;
                      }

                      Navigator.of(dialogContext).pop();

                      await _updateStore(
                        storeId: storeId,
                        name: name,
                        address: addressController.text,
                        phone: phoneController.text,
                      );
                    },
              child: const Text('Save Changes'),
            ),
          ],
        );
      },
    );

    nameController.dispose();
    addressController.dispose();
    phoneController.dispose();
  }

  Future<void> _showCreateProductDialog() async {
    if (selectedStore == null) {
      _showMessage(
        'Select a store before creating a product.',
        isError: true,
      );
      return;
    }

    final nameController = TextEditingController();
    final descriptionController = TextEditingController();
    final priceController = TextEditingController();
    int? selectedCategoryId;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              title: Text(
                'Create Product for ${selectedStore!['name']}',
              ),
              content: SizedBox(
                width: 500,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: nameController,
                        decoration: const InputDecoration(
                          labelText: 'Product name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: descriptionController,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Description',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: priceController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Price',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<int?>(
                        value: selectedCategoryId,
                        decoration: const InputDecoration(
                          labelText: 'Category (optional)',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem<int?>(
                            value: null,
                            child: Text('No category'),
                          ),
                          ...categories.map((category) {
                            final categoryId = int.tryParse(
                              category['id'].toString(),
                            );
                            return DropdownMenuItem<int?>(
                              value: categoryId,
                              child: Text(
                                category['name']?.toString() ?? 'Unnamed',
                              ),
                            );
                          }),
                        ],
                        onChanged: (value) {
                          setDialogState(() {
                            selectedCategoryId = value;
                          });
                        },
                      ),
                      if (categories.isEmpty) ...[
                        const SizedBox(height: 8),
                        const Text(
                          'No categories yet - create one from the Categories panel first if you want to organize products.',
                          style: TextStyle(
                            color: Color(0xFF625D5A),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                  },
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: _savingProduct
                      ? null
                      : () async {
                          final name = nameController.text.trim();
                          final price = double.tryParse(
                            priceController.text.trim(),
                          );

                          if (name.isEmpty) {
                            _showMessage(
                              'Product name is required.',
                              isError: true,
                            );
                            return;
                          }

                          if (price == null || price < 0) {
                            _showMessage(
                              'Enter a valid product price.',
                              isError: true,
                            );
                            return;
                          }

                          Navigator.of(dialogContext).pop();

                          await _createProduct(
                            name: name,
                            description: descriptionController.text,
                            price: price,
                            categoryId: selectedCategoryId,
                          );
                        },
                  child: const Text('Create Product'),
                ),
              ],
            );
          },
        );
      },
    );

    nameController.dispose();
    descriptionController.dispose();
    priceController.dispose();
  }


  Future<void> _showEditProductDialog(
    Map<String, dynamic> product,
  ) async {
    final productId = int.tryParse(product['id'].toString());

    if (productId == null) {
      _showMessage(
        'Invalid product ID.',
        isError: true,
      );
      return;
    }

    final nameController = TextEditingController(
      text: product['name']?.toString() ?? '',
    );

    final descriptionController = TextEditingController(
      text: product['description']?.toString() ?? '',
    );

    final priceController = TextEditingController(
      text: product['price']?.toString() ?? '',
    );

    final existingCategoryId = int.tryParse(
      product['category_id']?.toString() ?? '',
    );

    // Only pre-select if that category still exists in the currently
    // loaded list - avoids DropdownButtonFormField asserting on a stale id.
    int? selectedCategoryId = categories.any(
      (category) =>
          int.tryParse(category['id'].toString()) == existingCategoryId,
    )
        ? existingCategoryId
        : null;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              title: const Text('Edit Product'),
              content: SizedBox(
                width: 500,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: nameController,
                        decoration: const InputDecoration(
                          labelText: 'Product name',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: descriptionController,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Description',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: priceController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Price',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<int?>(
                        value: selectedCategoryId,
                        decoration: const InputDecoration(
                          labelText: 'Category (optional)',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem<int?>(
                            value: null,
                            child: Text('No category'),
                          ),
                          ...categories.map((category) {
                            final categoryId = int.tryParse(
                              category['id'].toString(),
                            );
                            return DropdownMenuItem<int?>(
                              value: categoryId,
                              child: Text(
                                category['name']?.toString() ?? 'Unnamed',
                              ),
                            );
                          }),
                        ],
                        onChanged: (value) {
                          setDialogState(() {
                            selectedCategoryId = value;
                          });
                        },
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                  },
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: _savingProduct
                      ? null
                      : () async {
                          final name = nameController.text.trim();
                          final price = double.tryParse(
                            priceController.text.trim(),
                          );

                          if (name.isEmpty) {
                            _showMessage(
                              'Product name is required.',
                              isError: true,
                            );
                            return;
                          }

                          if (price == null || price < 0) {
                            _showMessage(
                              'Enter a valid product price.',
                              isError: true,
                            );
                            return;
                          }

                          Navigator.of(dialogContext).pop();

                          await _updateProduct(
                            productId: productId,
                            name: name,
                            description: descriptionController.text,
                            price: price,
                            categoryId: selectedCategoryId,
                          );
                        },
                  child: const Text('Save Changes'),
                ),
              ],
            );
          },
        );
      },
    );

    nameController.dispose();
    descriptionController.dispose();
    priceController.dispose();
  }

  void _selectStore(Map<String, dynamic> store) {
    setState(() {
      selectedStore = store;
      products = [];
      categories = [];
    });

    _loadProductsForSelectedStore();
    _loadCategoriesForSelectedStore();
  }

  Future<void> _logout() async {
    // The router's redirect logic sends the user to /admin/login on its own
    // once AuthController notifies listeners that the session is gone.
    await _auth.logout();
  }

  bool _storeIsActive(Map<String, dynamic> store) {
    final value = store['is_active'];

    if (value is bool) {
      return value;
    }

    if (value is num) {
      return value != 0;
    }

    return value.toString() == '1' ||
        value.toString().toLowerCase() == 'true';
  }

  bool _productIsActive(Map<String, dynamic> product) {
    final value = product['is_active'];

    if (value is bool) {
      return value;
    }

    if (value is num) {
      return value != 0;
    }

    return value.toString() == '1' ||
        value.toString().toLowerCase() == 'true';
  }

  String _formatPrice(dynamic price) {
    final parsed = double.tryParse(price.toString());

    if (parsed == null) {
      return price.toString();
    }

    return parsed.toStringAsFixed(2);
  }

  // One tab per former stacked panel, plus a combined "Menu" tab for
  // Categories + Products (they were already shown side by side). Stores
  // stays its own tab rather than a persistent picker above the tabs -
  // _loadStores already auto-selects a sensible store on load, so the
  // common case (owner with one store, admin who rarely switches) never
  // needs to visit it just to keep working in another tab.
  List<_AdminTab> _buildTabs(bool isAdmin) {
    return [
      _AdminTab(
        title: 'Stores',
        icon: Icons.store_outlined,
        content: _buildStoresPanel(),
      ),
      _AdminTab(
        title: 'Menu',
        icon: Icons.restaurant_menu,
        content: _buildMenuTab(),
      ),
      _AdminTab(
        title: 'Orders',
        icon: Icons.receipt_long_outlined,
        content: OrdersPanel(selectedStore: selectedStore),
      ),
      _AdminTab(
        title: 'Modifiers',
        icon: Icons.tune,
        content: ModifiersPanel(
          selectedStore: selectedStore,
          products: products,
        ),
      ),
      _AdminTab(
        title: 'Hours',
        icon: Icons.schedule,
        content: StoreHoursPanel(selectedStore: selectedStore),
      ),
      _AdminTab(
        title: 'QR Codes',
        icon: Icons.qr_code,
        content: TableQrPanel(selectedStore: selectedStore),
      ),
      _AdminTab(
        title: 'Coupons',
        icon: Icons.local_offer_outlined,
        content: CouponsPanel(selectedStore: selectedStore),
      ),
      _AdminTab(
        title: 'Reports',
        icon: Icons.bar_chart,
        content: ReportsPanel(auth: _auth, selectedStore: selectedStore),
      ),
      // Staff-account creation and store-access grants are admin-only on
      // the backend (users.routes.js) - an owner reaching this page (their
      // own store's tools) would only see this panel 403 on every load, so
      // it's hidden rather than shown broken.
      if (isAdmin)
        _AdminTab(
          title: 'Users',
          icon: Icons.people_outline,
          content: UsersPanel(stores: stores),
        ),
    ];
  }

  Widget _buildMenuTab() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= 900;

        if (isWide) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 4, child: _buildCategoriesPanel()),
              const SizedBox(width: 20),
              Expanded(flex: 6, child: _buildProductsPanel()),
            ],
          );
        }

        return Column(
          children: [
            _buildCategoriesPanel(),
            const SizedBox(height: 20),
            _buildProductsPanel(),
          ],
        );
      },
    );
  }

  Widget _buildTabContent(Widget child) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1250),
          child: child,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = context.watch<AuthController>().isAdmin;
    final tabs = _buildTabs(isAdmin);

    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        backgroundColor: const Color(0xFFFFFBF7),
        appBar: AppBar(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          elevation: 0,
          title: const Text('Admin Dashboard'),
          actions: [
            IconButton(
              onPressed: _loadingStores ? null : _loadStores,
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh',
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: () => context.go('/kitchen'),
              icon: const Icon(Icons.soup_kitchen),
              label: const Text('Kitchen Display'),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: OutlinedButton.icon(
                onPressed: _logout,
                icon: const Icon(Icons.logout),
                label: const Text('Logout'),
              ),
            ),
          ],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: tabs
                .map(
                  (tab) => Tab(
                    icon: Icon(tab.icon, size: 20),
                    text: tab.title,
                  ),
                )
                .toList(),
          ),
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1250),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeader(),
                      if (_message != null) const SizedBox(height: 20),
                      if (_message != null) _buildMessage(),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: TabBarView(
                children:
                    tabs.map((tab) => _buildTabContent(tab.content)).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final adminName = _auth.name ?? 'Administrator';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [
            Color(0xFFFFF0E8),
            Color(0xFFFFFBF7),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: Colors.deepOrange.withValues(alpha: 0.14),
            child: const Icon(
              Icons.admin_panel_settings,
              color: Colors.deepOrange,
              size: 32,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Welcome, $adminName',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Manage stores and products from one place.',
                  style: TextStyle(
                    color: Color(0xFF625D5A),
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessage() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _messageIsError
            ? const Color(0xFFFFEDEA)
            : const Color(0xFFE8F6EC),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(
            _messageIsError
                ? Icons.error_outline
                : Icons.check_circle_outline,
            color: _messageIsError ? Colors.redAccent : Colors.green,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _message!,
              style: TextStyle(
                color: _messageIsError
                    ? Colors.redAccent
                    : Colors.green.shade800,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          IconButton(
            onPressed: _clearMessage,
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }

  Widget _buildStoresPanel() {
    // Creating a store is platform-level (POST /stores is requireAdmin-only
    // server-side) - an owner reaching this page for their own store would
    // only see this 403 on click, so it's hidden rather than shown broken,
    // same as UsersPanel below.
    final canCreateStore = context.watch<AuthController>().isAdmin;

    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Stores',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _loadingStores ? null : _loadStores,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh stores',
                ),
                if (canCreateStore)
                  IconButton(
                    onPressed: _showCreateStoreDialog,
                    icon: const Icon(Icons.add_business),
                    tooltip: 'Create store',
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (_loadingStores)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (stores.isEmpty)
              _buildEmptyState(
                icon: Icons.store_outlined,
                message: 'No stores found.',
                buttonLabel: canCreateStore ? 'Create Store' : null,
                onPressed: canCreateStore ? _showCreateStoreDialog : null,
              )
            else
              Column(
                children: stores.map(_buildStoreTile).toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStoreTile(Map<String, dynamic> store) {
    final isSelected = selectedStore != null &&
        selectedStore!['id'] == store['id'];

    final isActive = _storeIsActive(store);
    final productCount = store['product_count'] ?? 0;

    return Card(
      color: isSelected
          ? const Color(0xFFFFF3EB)
          : const Color(0xFFFAFAFA),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isSelected
              ? Colors.deepOrange
              : Colors.transparent,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _selectStore(store),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: isActive
                    ? Colors.green.withValues(alpha: 0.12)
                    : Colors.grey.withValues(alpha: 0.14),
                child: Icon(
                  Icons.store,
                  color: isActive ? Colors.green : Colors.grey,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      store['name']?.toString() ?? 'Unnamed Store',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      store['address']?.toString().isNotEmpty == true
                          ? store['address'].toString()
                          : 'No address',
                      style: const TextStyle(
                        color: Color(0xFF625D5A),
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '$productCount products • '
                      '${isActive ? 'Active' : 'Inactive'}',
                      style: TextStyle(
                        color: isActive ? Colors.green : Colors.grey,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: (value) async {
                  final storeId = int.tryParse(
                    store['id'].toString(),
                  );

                  if (storeId == null) return;

                  if (value == 'edit') {
                    await _showEditStoreDialog(store);
                  }

                  if (value == 'toggle') {
                    await _updateStoreStatus(
                      storeId: storeId,
                      isActive: !isActive,
                    );
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'edit',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.edit_outlined),
                      title: Text('Edit store'),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'toggle',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        isActive
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                      ),
                      title: Text(
                        isActive
                            ? 'Deactivate store'
                            : 'Activate store',
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCategoriesPanel() {
    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Categories',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: selectedStore == null || _loadingCategories
                      ? null
                      : _loadCategoriesForSelectedStore,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh categories',
                ),
                IconButton(
                  onPressed: selectedStore == null
                      ? null
                      : _showCreateCategoryDialog,
                  icon: const Icon(Icons.add),
                  tooltip: 'Create category',
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (selectedStore == null)
              _buildEmptyState(
                icon: Icons.touch_app_outlined,
                message: 'Select a store to manage its categories.',
              )
            else if (_loadingCategories)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (categories.isEmpty)
              _buildEmptyState(
                icon: Icons.label_outline,
                message: 'No categories yet for this store.',
                buttonLabel: 'Create Category',
                onPressed: _showCreateCategoryDialog,
              )
            else
              Column(
                children: categories.map(_buildCategoryTile).toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryTile(Map<String, dynamic> category) {
    final categoryId = int.tryParse(category['id'].toString());

    return Card(
      color: const Color(0xFFFAFAFA),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Row(
          children: [
            const Icon(Icons.label_outline, color: Colors.deepOrange),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                category['name']?.toString() ?? 'Unnamed',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            if (categoryId != null)
              PopupMenuButton<String>(
                onSelected: (value) async {
                  if (value == 'edit') {
                    await _showEditCategoryDialog(category);
                  }

                  if (value == 'delete') {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (dialogContext) {
                        return AlertDialog(
                          title: const Text('Delete Category'),
                          content: Text(
                            'Delete "${category['name']}"? This cannot be undone.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () =>
                                  Navigator.of(dialogContext).pop(false),
                              child: const Text('Cancel'),
                            ),
                            FilledButton(
                              onPressed: () =>
                                  Navigator.of(dialogContext).pop(true),
                              child: const Text('Delete'),
                            ),
                          ],
                        );
                      },
                    );

                    if (confirmed == true) {
                      await _deleteCategory(categoryId);
                    }
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'edit',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.edit_outlined),
                      title: Text('Edit'),
                    ),
                  ),
                  const PopupMenuItem(
                    value: 'delete',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.delete_outline),
                      title: Text('Delete'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _showCreateCategoryDialog() async {
    if (selectedStore == null) {
      _showMessage(
        'Select a store before creating a category.',
        isError: true,
      );
      return;
    }

    final nameController = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(
            'Create Category for ${selectedStore!['name']}',
          ),
          content: SizedBox(
            width: 420,
            child: TextField(
              controller: nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Category name',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: _savingCategory
                  ? null
                  : () async {
                      final name = nameController.text.trim();

                      if (name.isEmpty) {
                        _showMessage(
                          'Category name is required.',
                          isError: true,
                        );
                        return;
                      }

                      Navigator.of(dialogContext).pop();

                      await _createCategory(name: name);
                    },
              child: const Text('Create'),
            ),
          ],
        );
      },
    );

    nameController.dispose();
  }

  Future<void> _showEditCategoryDialog(
    Map<String, dynamic> category,
  ) async {
    final categoryId = int.tryParse(category['id'].toString());

    if (categoryId == null) {
      _showMessage(
        'Invalid category ID.',
        isError: true,
      );
      return;
    }

    final nameController = TextEditingController(
      text: category['name']?.toString() ?? '',
    );

    final currentSortOrder =
        int.tryParse(category['sort_order']?.toString() ?? '') ?? 0;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Edit Category'),
          content: SizedBox(
            width: 420,
            child: TextField(
              controller: nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Category name',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: _savingCategory
                  ? null
                  : () async {
                      final name = nameController.text.trim();

                      if (name.isEmpty) {
                        _showMessage(
                          'Category name is required.',
                          isError: true,
                        );
                        return;
                      }

                      Navigator.of(dialogContext).pop();

                      await _updateCategory(
                        categoryId: categoryId,
                        name: name,
                        sortOrder: currentSortOrder,
                      );
                    },
              child: const Text('Save Changes'),
            ),
          ],
        );
      },
    );

    nameController.dispose();
  }

  Widget _buildProductsPanel() {
    final storeName = selectedStore?['name']?.toString();

    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    storeName == null
                        ? 'Products'
                        : 'Products · $storeName',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: selectedStore == null || _loadingProducts
                      ? null
                      : _loadProductsForSelectedStore,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh products',
                ),
                IconButton(
                  onPressed: selectedStore == null
                      ? null
                      : _showCreateProductDialog,
                  icon: const Icon(Icons.add),
                  tooltip: 'Create product',
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (selectedStore == null)
              _buildEmptyState(
                icon: Icons.touch_app_outlined,
                message: 'Select a store to view its products.',
              )
            else if (_loadingProducts)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (products.isEmpty)
              _buildEmptyState(
                icon: Icons.inventory_2_outlined,
                message: 'This store has no products yet.',
                buttonLabel: 'Create Product',
                onPressed: _showCreateProductDialog,
              )
            else
              Column(
                children: products.map(_buildProductTile).toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildProductTile(Map<String, dynamic> product) {
    final productId = int.tryParse(
      product['id'].toString(),
    );

    final isActive = _productIsActive(product);

    return Card(
      color: const Color(0xFFFAFAFA),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: isActive
                  ? Colors.deepOrange.withValues(alpha: 0.12)
                  : Colors.grey.withValues(alpha: 0.14),
              child: Icon(
                Icons.fastfood,
                color: isActive ? Colors.deepOrange : Colors.grey,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product['name']?.toString() ?? 'Unnamed Product',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (product['category_name'] != null &&
                      product['category_name'].toString().isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.deepOrange.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        product['category_name'].toString(),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.deepOrange,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 5),
                  Text(
                    product['description']?.toString().isNotEmpty == true
                        ? product['description'].toString()
                        : 'No description',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF625D5A),
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    '\$${_formatPrice(product['price'])}',
                    style: const TextStyle(
                      color: Colors.deepOrange,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
            if (productId != null)
              PopupMenuButton<String>(
                onSelected: (value) async {
                  if (value == 'edit') {
                    await _showEditProductDialog(product);
                  }

                  if (value == 'toggle') {
                    await _updateProductStatus(
                      productId: productId,
                      isActive: !isActive,
                    );
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'edit',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.edit_outlined),
                      title: Text('Edit product'),
                    ),
                  ),
                  PopupMenuItem(
                    value: 'toggle',
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        isActive
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                      ),
                      title: Text(
                        isActive
                            ? 'Deactivate product'
                            : 'Activate product',
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState({
    required IconData icon,
    required String message,
    String? buttonLabel,
    VoidCallback? onPressed,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            size: 42,
            color: Colors.grey,
          ),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFF625D5A),
            ),
          ),
          if (buttonLabel != null && onPressed != null) ...[
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onPressed,
              icon: const Icon(Icons.add),
              label: Text(buttonLabel),
            ),
          ],
        ],
      ),
    );
  }
}
