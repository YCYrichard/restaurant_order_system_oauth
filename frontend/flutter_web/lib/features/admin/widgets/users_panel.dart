import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/api/response_message.dart';

/// Admin panel for managing which users have access to which stores
/// (owner_store_access) - previously this could only be done by hand-editing
/// the database directly, since no API or UI for it existed.
class UsersPanel extends StatefulWidget {
  final List<Map<String, dynamic>> stores;

  const UsersPanel({super.key, required this.stores});

  @override
  State<UsersPanel> createState() => _UsersPanelState();
}

class _UsersPanelState extends State<UsersPanel> {
  List<Map<String, dynamic>> _users = [];
  bool _loading = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  AuthController get _auth => context.read<AuthController>();

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;

    setState(() {
      _message = message;
      _messageIsError = isError;
    });
  }

  Future<void> _loadUsers() async {
    setState(() {
      _loading = true;
    });

    try {
      final response =
          await _auth.authorizedRequest('GET', '/api/v1/users?pageSize=50');

      if (response.statusCode != 200) {
        _showMessage(responseErrorMessage(response, 'Failed to load users.'), isError: true);
        setState(() => _loading = false);
        return;
      }

      final decoded = jsonDecode(response.body);
      final loaded = decoded is Map && decoded['users'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['users'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      setState(() {
        _users = loaded;
        _loading = false;
      });
    } catch (error) {
      setState(() => _loading = false);
      _showMessage(networkErrorMessage(), isError: true);
    }
  }

  /// Creates a username/password account for a kitchen or store owner.
  /// Admin accounts aren't creatable here on purpose - the backend rejects
  /// role 'admin' on this endpoint.
  Future<void> _showCreateStaffDialog() async {
    final nameController = TextEditingController();
    final usernameController = TextEditingController();
    final passwordController = TextEditingController();
    var role = 'staff';

    final created = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Create Staff Account'),
              content: SizedBox(
                width: 420,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: nameController,
                      autofocus: true,
                      decoration: const InputDecoration(
                        labelText: 'Display name (e.g. Kitchen)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: usernameController,
                      decoration: const InputDecoration(
                        labelText: 'Username',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: passwordController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Password (min 8 characters)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: role,
                      decoration: const InputDecoration(
                        labelText: 'Role',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'staff',
                          child: Text('Staff (kitchen display)'),
                        ),
                        DropdownMenuItem(
                          value: 'owner',
                          child: Text('Owner (their own stores)'),
                        ),
                      ],
                      onChanged: (value) =>
                          setDialogState(() => role = value ?? 'staff'),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'After creating the account, grant it access to a '
                      'store below - without a grant it can sign in but '
                      'will see nothing.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF77716D),
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
                      '/api/v1/users',
                      body: {
                        'name': nameController.text.trim(),
                        'username': usernameController.text.trim(),
                        'password': passwordController.text,
                        'role': role,
                      },
                    );

                    if (!dialogContext.mounted) return;

                    if (response.statusCode != 201) {
                      final decoded = jsonDecode(response.body);
                      final message =
                          decoded is Map && decoded['message'] != null
                              ? decoded['message'].toString()
                              : 'Failed to create the account.';

                      ScaffoldMessenger.of(dialogContext).showSnackBar(
                        SnackBar(content: Text(message)),
                      );
                      return;
                    }

                    Navigator.of(dialogContext).pop(true);
                  },
                  child: const Text('Create'),
                ),
              ],
            );
          },
        );
      },
    );

    if (created == true) {
      await _loadUsers();
      _showMessage('Staff account created. Now grant it store access.');
    }
  }

  Future<void> _showManageAccessDialog(Map<String, dynamic> user) async {
    final userId = int.tryParse(user['id'].toString());
    if (userId == null) return;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => _StoreAccessDialog(
        userId: userId,
        userName: user['name']?.toString() ?? 'User',
        stores: widget.stores,
        auth: _auth,
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
                    'Users & Store Access',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _loadUsers,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh users',
                ),
                IconButton(
                  onPressed: _showCreateStaffDialog,
                  icon: const Icon(Icons.person_add_alt),
                  tooltip: 'Create staff account',
                ),
              ],
            ),
            const SizedBox(height: 8),
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
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_users.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFFFAFAFA),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'No users yet.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF625D5A)),
                ),
              )
            else
              Column(children: _users.map(_buildUserTile).toList()),
          ],
        ),
      ),
    );
  }

  Widget _buildUserTile(Map<String, dynamic> user) {
    final name = user['name']?.toString() ?? 'Unnamed';
    final email = user['email']?.toString();
    final provider = user['provider']?.toString() ?? '';
    final role = user['role']?.toString() ?? 'customer';

    return Card(
      color: const Color(0xFFFAFAFA),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: Colors.deepOrange.withValues(alpha: 0.10),
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : '?',
                style: const TextStyle(
                  color: Colors.deepOrange,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(
                    [if (email != null) email, provider, role].join(' · '),
                    style: const TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
                  ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: () => _showManageAccessDialog(user),
              icon: const Icon(Icons.storefront_outlined, size: 18),
              label: const Text('Store Access'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoreAccessDialog extends StatefulWidget {
  final int userId;
  final String userName;
  final List<Map<String, dynamic>> stores;
  final AuthController auth;

  const _StoreAccessDialog({
    required this.userId,
    required this.userName,
    required this.stores,
    required this.auth,
  });

  @override
  State<_StoreAccessDialog> createState() => _StoreAccessDialogState();
}

class _StoreAccessDialogState extends State<_StoreAccessDialog> {
  static const _accessRoles = ['owner', 'manager', 'staff'];

  List<Map<String, dynamic>> _grants = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  int? _selectedStoreId;
  String _selectedRole = 'owner';

  @override
  void initState() {
    super.initState();
    _loadGrants();
  }

  Future<void> _loadGrants() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.auth.authorizedRequest(
        'GET',
        '/api/v1/users/${widget.userId}/store-access',
      );

      if (response.statusCode != 200) {
        setState(() {
          _error = 'Failed to load store access.';
          _loading = false;
        });
        return;
      }

      final decoded = jsonDecode(response.body);
      final grants = decoded is Map && decoded['storeAccess'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['storeAccess'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      setState(() {
        _grants = grants;
        _loading = false;
      });
    } catch (error) {
      setState(() {
        _error = networkErrorMessage();
        _loading = false;
      });
    }
  }

  Future<void> _grantAccess() async {
    if (_selectedStoreId == null) return;

    setState(() => _saving = true);

    try {
      final response = await widget.auth.authorizedRequest(
        'POST',
        '/api/v1/users/${widget.userId}/store-access',
        body: {'storeId': _selectedStoreId, 'accessRole': _selectedRole},
      );

      if (response.statusCode != 201) {
        final decoded = jsonDecode(response.body);
        final message = decoded is Map && decoded['message'] != null
            ? decoded['message'].toString()
            : 'Failed to grant access.';

        setState(() {
          _error = message;
          _saving = false;
        });
        return;
      }

      _selectedStoreId = null;
      await _loadGrants();
      setState(() => _saving = false);
    } catch (error) {
      setState(() {
        _error = networkErrorMessage();
        _saving = false;
      });
    }
  }

  Future<void> _revokeAccess(int storeId) async {
    setState(() => _saving = true);

    try {
      final response = await widget.auth.authorizedRequest(
        'DELETE',
        '/api/v1/users/${widget.userId}/store-access/$storeId',
      );

      if (response.statusCode != 200) {
        setState(() {
          _error = 'Failed to revoke access.';
          _saving = false;
        });
        return;
      }

      await _loadGrants();
      setState(() => _saving = false);
    } catch (error) {
      setState(() {
        _error = networkErrorMessage();
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final grantedStoreIds = _grants
        .map((g) => int.tryParse(g['store_id'].toString()))
        .whereType<int>()
        .toSet();

    final availableStores = widget.stores.where((s) {
      final id = int.tryParse(s['id'].toString());
      return id != null && !grantedStoreIds.contains(id);
    }).toList();

    return AlertDialog(
      title: Text('Store Access — ${widget.userName}'),
      content: SizedBox(
        width: 480,
        child: _loading
            ? const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_error != null) ...[
                    Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                    const SizedBox(height: 12),
                  ],
                  if (_grants.isEmpty)
                    const Text(
                      'No store access granted yet.',
                      style: TextStyle(color: Color(0xFF625D5A)),
                    )
                  else
                    ..._grants.map((grant) {
                      final storeId = int.tryParse(grant['store_id'].toString());

                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          grant['store_name']?.toString() ?? 'Store #$storeId',
                        ),
                        subtitle: Text(grant['access_role']?.toString() ?? ''),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline),
                          onPressed: _saving || storeId == null
                              ? null
                              : () => _revokeAccess(storeId),
                        ),
                      );
                    }),
                  const Divider(height: 24),
                  if (availableStores.isEmpty)
                    const Text(
                      'This user already has access to every store.',
                      style: TextStyle(color: Color(0xFF625D5A)),
                    )
                  else ...[
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            initialValue: _selectedStoreId,
                            decoration: const InputDecoration(labelText: 'Store'),
                            items: availableStores.map((store) {
                              final id = int.tryParse(store['id'].toString());
                              return DropdownMenuItem(
                                value: id,
                                child: Text(
                                  store['name']?.toString() ?? 'Store #$id',
                                ),
                              );
                            }).toList(),
                            onChanged: (value) =>
                                setState(() => _selectedStoreId = value),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            initialValue: _selectedRole,
                            decoration: const InputDecoration(labelText: 'Role'),
                            items: _accessRoles
                                .map(
                                  (role) => DropdownMenuItem(
                                    value: role,
                                    child: Text(role),
                                  ),
                                )
                                .toList(),
                            onChanged: (value) => setState(
                              () => _selectedRole = value ?? 'owner',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.icon(
                        onPressed: _saving || _selectedStoreId == null
                            ? null
                            : _grantAccess,
                        icon: const Icon(Icons.add),
                        label: const Text('Grant Access'),
                      ),
                    ),
                  ],
                ],
              ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
