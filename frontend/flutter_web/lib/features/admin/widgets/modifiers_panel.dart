import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_controller.dart';

/// Modifier groups (Size, Add-ons, ...) and their options, plus which
/// products each group is attached to. Groups are store-level and reusable,
/// so "Size" is defined once rather than per product.
class ModifiersPanel extends StatefulWidget {
  final Map<String, dynamic>? selectedStore;
  final List<Map<String, dynamic>> products;

  const ModifiersPanel({
    super.key,
    required this.selectedStore,
    required this.products,
  });

  @override
  State<ModifiersPanel> createState() => _ModifiersPanelState();
}

class _ModifiersPanelState extends State<ModifiersPanel> {
  List<Map<String, dynamic>> _groups = [];
  bool _loading = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ModifiersPanel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.selectedStore?['id'] != widget.selectedStore?['id']) {
      _load();
    }
  }

  AuthController get _auth => context.read<AuthController>();

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;
    setState(() {
      _message = message;
      _messageIsError = isError;
    });
  }

  Future<void> _load() async {
    final storeId = widget.selectedStore?['id'];
    if (storeId == null) {
      setState(() => _groups = []);
      return;
    }

    setState(() => _loading = true);

    try {
      final response =
          await _auth.authorizedRequest('GET', '/modifiers/store/$storeId');

      if (response.statusCode != 200) {
        _showMessage('Failed to load modifier groups.', isError: true);
        setState(() => _loading = false);
        return;
      }

      final decoded = jsonDecode(response.body);
      final loaded = decoded is Map && decoded['groups'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['groups'] as List)
                  .whereType<Map>()
                  .map((g) => Map<String, dynamic>.from(g)),
            )
          : <Map<String, dynamic>>[];

      if (!mounted) return;

      setState(() {
        _groups = loaded;
        _loading = false;
      });
    } catch (error) {
      setState(() => _loading = false);
      _showMessage('Network error loading modifiers: $error', isError: true);
    }
  }

  Future<void> _createGroup() async {
    final storeId = widget.selectedStore?['id'];
    if (storeId == null) return;

    final nameController = TextEditingController();
    final minController = TextEditingController(text: '0');
    final maxController = TextEditingController(text: '1');

    final created = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('New Modifier Group'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Group name (e.g. Size, Add-ons)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: minController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Min choices',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: maxController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Max choices',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'Min 1 makes the group required — the customer must pick '
                'before they can add the item.',
                style: TextStyle(fontSize: 12, color: Color(0xFF77716D)),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final response = await _auth.authorizedRequest(
                'POST',
                '/modifiers/store/$storeId',
                body: {
                  'name': nameController.text.trim(),
                  'minSelect': int.tryParse(minController.text.trim()) ?? 0,
                  'maxSelect': int.tryParse(maxController.text.trim()) ?? 1,
                },
              );

              if (!dialogContext.mounted) return;

              if (response.statusCode != 201) {
                final decoded = jsonDecode(response.body);
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(
                    content: Text(
                      decoded is Map && decoded['message'] != null
                          ? decoded['message'].toString()
                          : 'Failed to create the group.',
                    ),
                  ),
                );
                return;
              }

              Navigator.of(dialogContext).pop(true);
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );

    if (created == true) {
      await _load();
      _showMessage('Group created. Add its options next.');
    }
  }

  Future<void> _addOption(int groupId) async {
    final nameController = TextEditingController();
    final priceController = TextEditingController(text: '0');

    final added = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Add Option'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Option name (e.g. Large)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: priceController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Price change (0 for none)',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final response = await _auth.authorizedRequest(
                'POST',
                '/modifiers/$groupId/options',
                body: {
                  'name': nameController.text.trim(),
                  'priceDelta':
                      double.tryParse(priceController.text.trim()) ?? 0,
                },
              );

              if (!dialogContext.mounted) return;

              if (response.statusCode != 201) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  const SnackBar(content: Text('Failed to add the option.')),
                );
                return;
              }

              Navigator.of(dialogContext).pop(true);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );

    if (added == true) await _load();
  }

  Future<void> _deleteGroup(int groupId, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete group'),
        content: Text(
          'Delete "$name" and all its options? Past orders keep the choices '
          'they recorded — only the menu changes.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final response =
        await _auth.authorizedRequest('DELETE', '/modifiers/$groupId');

    if (response.statusCode == 200) {
      await _load();
      _showMessage('Group deleted.');
    }
  }

  Future<void> _manageProducts(Map<String, dynamic> group) async {
    final groupId = int.tryParse(group['id'].toString());
    if (groupId == null) return;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Apply "${group['name']}" to products'),
        content: SizedBox(
          width: 420,
          height: 360,
          child: widget.products.isEmpty
              ? const Center(child: Text('This store has no products yet.'))
              : ListView(
                  children: widget.products.map((product) {
                    final productId = int.tryParse(product['id'].toString());

                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(product['name']?.toString() ?? 'Product'),
                      trailing: Wrap(
                        spacing: 4,
                        children: [
                          TextButton(
                            onPressed: productId == null
                                ? null
                                : () async {
                                    await _auth.authorizedRequest(
                                      'POST',
                                      '/modifiers/$groupId/products/$productId',
                                    );
                                    if (!dialogContext.mounted) return;
                                    ScaffoldMessenger.of(dialogContext)
                                        .showSnackBar(
                                      const SnackBar(
                                        content: Text('Applied.'),
                                        duration: Duration(seconds: 1),
                                      ),
                                    );
                                  },
                            child: const Text('Apply'),
                          ),
                          TextButton(
                            onPressed: productId == null
                                ? null
                                : () async {
                                    await _auth.authorizedRequest(
                                      'DELETE',
                                      '/modifiers/$groupId/products/$productId',
                                    );
                                    if (!dialogContext.mounted) return;
                                    ScaffoldMessenger.of(dialogContext)
                                        .showSnackBar(
                                      const SnackBar(
                                        content: Text('Removed.'),
                                        duration: Duration(seconds: 1),
                                      ),
                                    );
                                  },
                            child: const Text('Remove'),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Modifier Groups',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                ),
                IconButton(
                  onPressed:
                      widget.selectedStore == null ? null : _createGroup,
                  icon: const Icon(Icons.add),
                  tooltip: 'New group',
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Options like size or add-ons, with price changes. Defined once '
              'per store and applied to any number of products.',
              style: TextStyle(fontSize: 12, color: Color(0xFF77716D)),
            ),
            const SizedBox(height: 12),
            if (_message != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: _messageIsError
                      ? const Color(0xFFFFEDEA)
                      : const Color(0xFFE8F6EC),
                  borderRadius: BorderRadius.circular(12),
                ),
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
            if (widget.selectedStore == null)
              _buildEmptyState('Select a store to manage its modifiers.')
            else if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_groups.isEmpty)
              _buildEmptyState('No modifier groups yet.')
            else
              Column(children: _groups.map(_buildGroupTile).toList()),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFF625D5A)),
      ),
    );
  }

  Widget _buildGroupTile(Map<String, dynamic> group) {
    final groupId = int.tryParse(group['id'].toString());
    final name = group['name']?.toString() ?? 'Group';
    final isRequired = group['is_required'] == 1 || group['is_required'] == true;
    final options = group['options'] is List
        ? List.from(group['options'])
        : const [];

    return Card(
      color: const Color(0xFFFAFAFA),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '$name  ·  ${group['min_select']}-${group['max_select']}'
                    '${isRequired ? '  ·  required' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                if (groupId != null) ...[
                  TextButton(
                    onPressed: () => _addOption(groupId),
                    child: const Text('Add option'),
                  ),
                  TextButton(
                    onPressed: () => _manageProducts(group),
                    child: const Text('Products'),
                  ),
                  IconButton(
                    onPressed: () => _deleteGroup(groupId, name),
                    icon: const Icon(Icons.delete_outline),
                    tooltip: 'Delete group',
                  ),
                ],
              ],
            ),
            if (options.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text(
                  'No options yet — the group is ignored until it has some.',
                  style: TextStyle(fontSize: 12, color: Colors.redAccent),
                ),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: options.map<Widget>((option) {
                  final delta =
                      double.tryParse(option['price_delta'].toString()) ?? 0;

                  return Chip(
                    label: Text(
                      '${option['name']}'
                      '${delta == 0 ? '' : ' +\$${delta.toStringAsFixed(2)}'}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    visualDensity: VisualDensity.compact,
                  );
                }).toList(),
              ),
          ],
        ),
      ),
    );
  }
}
