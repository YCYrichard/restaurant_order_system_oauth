// ignore_for_file: deprecated_member_use

import 'dart:convert';
import 'dart:html' as html;
import 'package:flutter/material.dart';

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);

class AdminPage extends StatefulWidget {
  const AdminPage({super.key});

  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage> {
  List<Map<String, dynamic>> stores = [];
  Map<String, dynamic>? selectedStore;

  final _storeNameController = TextEditingController();
  final _storeAddressController = TextEditingController();
  final _storePhoneController = TextEditingController();

  final _productNameController = TextEditingController();
  final _productPriceController = TextEditingController();

  String? _message;
  bool _loadingStores = false;
  bool _creatingStore = false;
  bool _creatingProduct = false;

  @override
  void initState() {
    super.initState();
    _loadStores();
  }

  Future<void> _loadStores() async {
    setState(() {
      _loadingStores = true;
      _message = null;
    });

    try {
      final request = await html.HttpRequest.request(
        '$apiBaseUrl/stores',
        method: 'GET',
      );

      if (request.status == 200) {
        final data = jsonDecode(request.responseText ?? '{}');
        final list = (data['stores'] as List?) ?? [];
        setState(() {
          stores = list.cast<Map<String, dynamic>>();
          if (stores.isNotEmpty && selectedStore == null) {
            selectedStore = stores.first;
          }
          _loadingStores = false;
        });
      } else {
        setState(() {
          _loadingStores = false;
          _message = 'Failed to load stores: ${request.responseText}';
        });
      }
    } catch (e) {
      setState(() {
        _loadingStores = false;
        _message = 'Network error loading stores: ${e.toString()}';
      });
    }
  }

  Future<void> _createStore() async {
    final name = _storeNameController.text.trim();
    if (name.isEmpty) {
      setState(() => _message = 'Store name is required.');
      return;
    }

    setState(() {
      _creatingStore = true;
      _message = null;
    });

    final body = {
      'name': name,
      'address': _storeAddressController.text.trim(),
      'phone': _storePhoneController.text.trim(),
    };

    try {
      final request = await html.HttpRequest.request(
        '$apiBaseUrl/stores',
        method: 'POST',
        requestHeaders: {'Content-Type': 'application/json'},
        sendData: jsonEncode(body),
      );

      if (request.status == 201) {
        setState(() {
          _creatingStore = false;
          _storeNameController.clear();
          _storeAddressController.clear();
          _storePhoneController.clear();
          _message = 'Store created successfully.';
        });
        await _loadStores();
      } else {
        setState(() {
          _creatingStore = false;
          _message = 'Failed to create store: ${request.responseText}';
        });
      }
    } catch (e) {
      setState(() {
        _creatingStore = false;
        _message = 'Network error creating store: ${e.toString()}';
      });
    }
  }

  Future<void> _createProduct() async {
    if (selectedStore == null) {
      setState(() => _message = 'Select a store first.');
      return;
    }

    final name = _productNameController.text.trim();
    final priceText = _productPriceController.text.trim();
    if (name.isEmpty || priceText.isEmpty) {
      setState(() => _message = 'Product name and price are required.');
      return;
    }

    final price = double.tryParse(priceText);
    if (price == null) {
      setState(() => _message = 'Price must be a number.');
      return;
    }

    setState(() {
      _creatingProduct = true;
      _message = null;
    });

    final body = {
      'storeId': selectedStore!['id'],
      'name': name,
      'price': price,
      'isActive': true,
    };

    try {
      final request = await html.HttpRequest.request(
        '$apiBaseUrl/products',
        method: 'POST',
        requestHeaders: {'Content-Type': 'application/json'},
        sendData: jsonEncode(body),
      );

      if (request.status == 201) {
        setState(() {
          _creatingProduct = false;
          _productNameController.clear();
          _productPriceController.clear();
          _message = 'Product created successfully.';
        });
      } else {
        setState(() {
          _creatingProduct = false;
          _message = 'Failed to create product: ${request.responseText}';
        });
      }
    } catch (e) {
      setState(() {
        _creatingProduct = false;
        _message = 'Network error creating product: ${e.toString()}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin – Stores & Products'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1100),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_message != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF3EB),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _message!,
                      style: const TextStyle(
                        color: Colors.deepOrange,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 5,
                      child: _buildStoresPanel(),
                    ),
                    const SizedBox(width: 24),
                    Expanded(
                      flex: 5,
                      child: _buildCreateStoreForm(),
                    ),
                  ],
                ),
                const SizedBox(height: 32),
                _buildCreateProductForm(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStoresPanel() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Stores',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: _loadingStores ? null : _loadStores,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Reload stores',
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_loadingStores)
              const Padding(
                padding: EdgeInsets.all(8.0),
                child: CircularProgressIndicator(),
              )
            else if (stores.isEmpty)
              const Text('No stores yet. Create one using the form on the right.')
            else
              Column(
                children: stores.map((store) {
                  final selected = selectedStore != null &&
                      selectedStore!['id'] == store['id'];
                  return ListTile(
                    title: Text(store['name'] ?? ''),
                    subtitle: Text(
                      '${store['address'] ?? ''}\n${store['phone'] ?? ''}',
                    ),
                    isThreeLine: true,
                    selected: selected,
                    onTap: () {
                      setState(() {
                        selectedStore = store;
                      });
                    },
                  );
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCreateStoreForm() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Create Store',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _storeNameController,
              decoration: const InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _storeAddressController,
              decoration: const InputDecoration(
                labelText: 'Address',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _storePhoneController,
              decoration: const InputDecoration(
                labelText: 'Phone',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: _creatingStore ? null : _createStore,
                icon: _creatingStore
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add_business),
                label: Text(_creatingStore ? 'Creating...' : 'Create Store'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCreateProductForm() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Create Product for Selected Store',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 12),
            if (selectedStore == null)
              const Text('Select a store in the Stores panel first.')
            else
              Text(
                'Selected Store: ${selectedStore!['name']}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _productNameController,
              decoration: const InputDecoration(
                labelText: 'Product Name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _productPriceController,
              decoration: const InputDecoration(
                labelText: 'Price',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed:
                    _creatingProduct || selectedStore == null ? null : _createProduct,
                icon: _creatingProduct
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add),
                label: Text(_creatingProduct ? 'Creating...' : 'Create Product'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}