import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/api/response_message.dart';
import '../../../core/auth/auth_controller.dart';

/// Read-only, append-only trail of admin actions (refunds, price/store
/// changes, store-access grants, admin login attempts). Admin-only -
/// platform-wide, not scoped to a single store, same reasoning as
/// UsersPanel being hidden from owners.
const List<String> _knownActions = [
  'order.refunded',
  'store.updated',
  'product.updated',
  'product.status_changed',
  'user.staff_created',
  'store_access.granted',
  'store_access.revoked',
  'coupon.created',
  'coupon.status_changed',
  'coupon.deleted',
  'auth.admin_login_succeeded',
  'auth.admin_login_failed',
];

class AuditLogPanel extends StatefulWidget {
  final List<Map<String, dynamic>> stores;

  const AuditLogPanel({super.key, required this.stores});

  @override
  State<AuditLogPanel> createState() => _AuditLogPanelState();
}

class _AuditLogPanelState extends State<AuditLogPanel> {
  static const int _pageSize = 50;

  List<Map<String, dynamic>> _entries = [];
  bool _loading = false;
  String? _error;
  int _page = 1;
  int _total = 0;
  int? _storeIdFilter;
  String? _actionFilter;

  @override
  void initState() {
    super.initState();
    _load();
  }

  AuthController get _auth => context.read<AuthController>();

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final params = <String, String>{
      'page': '$_page',
      'pageSize': '$_pageSize',
    };
    if (_storeIdFilter != null) params['storeId'] = '$_storeIdFilter';
    if (_actionFilter != null) params['action'] = _actionFilter!;

    final query = Uri(queryParameters: params).query;

    try {
      final response =
          await _auth.authorizedRequest('GET', '/api/v1/audit-log?$query');

      if (!mounted) return;

      if (response.statusCode != 200) {
        setState(() {
          _error = responseErrorMessage(response, 'Failed to load the audit log.');
          _loading = false;
        });
        return;
      }

      final decoded = jsonDecode(response.body);
      final entries = decoded is Map && decoded['entries'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['entries'] as List)
                  .whereType<Map>()
                  .map((e) => Map<String, dynamic>.from(e)),
            )
          : <Map<String, dynamic>>[];

      setState(() {
        _entries = entries;
        _total = decoded is Map ? (decoded['total'] as int? ?? 0) : 0;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = networkErrorMessage();
        _loading = false;
      });
    }
  }

  int get _maxPage => _total == 0 ? 1 : ((_total - 1) ~/ _pageSize) + 1;

  void _changePage(int delta) {
    final next = (_page + delta).clamp(1, _maxPage);
    if (next == _page) return;

    setState(() => _page = next);
    _load();
  }

  void _applyFilters({int? storeId, String? action}) {
    setState(() {
      _storeIdFilter = storeId;
      _actionFilter = action;
      _page = 1;
    });
    _load();
  }

  String _formatTimestamp(dynamic value) {
    final parsed = DateTime.tryParse('$value');
    if (parsed == null) return '$value';

    final local = parsed.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${local.year}-${two(local.month)}-${two(local.day)} '
        '${two(local.hour)}:${two(local.minute)}';
  }

  String _formatDetails(dynamic details) {
    if (details == null) return '';

    try {
      final decoded = details is String ? jsonDecode(details) : details;
      if (decoded is Map && decoded.isEmpty) return '';
      return jsonEncode(decoded);
    } catch (_) {
      return '$details';
    }
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
                    'Audit Log',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Who did what, to which store, and when - refunds, price and '
              'store changes, store-access grants, and admin login attempts. '
              'Append-only; nothing here can be edited or deleted.',
              style: TextStyle(color: Color(0xFF625D5A), height: 1.4),
            ),
            const SizedBox(height: 16),
            _buildFilters(),
            const SizedBox(height: 16),
            if (_error != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEDEA),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: Colors.redAccent,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_entries.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFFFAFAFA),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'No matching audit log entries.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF625D5A)),
                ),
              )
            else ...[
              ..._entries.map(_buildEntryTile),
              const SizedBox(height: 12),
              _buildPagination(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFilters() {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        DropdownButton<int?>(
          value: _storeIdFilter,
          hint: const Text('All stores'),
          items: [
            const DropdownMenuItem<int?>(value: null, child: Text('All stores')),
            ...widget.stores.map((store) {
              final storeId = int.tryParse(store['id'].toString());
              return DropdownMenuItem<int?>(
                value: storeId,
                child: Text(store['name']?.toString() ?? 'Unnamed store'),
              );
            }),
          ],
          onChanged: (value) => _applyFilters(storeId: value, action: _actionFilter),
        ),
        DropdownButton<String?>(
          value: _actionFilter,
          hint: const Text('All actions'),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('All actions')),
            ..._knownActions.map(
              (action) => DropdownMenuItem<String?>(value: action, child: Text(action)),
            ),
          ],
          onChanged: (value) => _applyFilters(storeId: _storeIdFilter, action: value),
        ),
      ],
    );
  }

  Widget _buildEntryTile(Map<String, dynamic> entry) {
    final actorName = entry['actor_name']?.toString();
    final actorRole = entry['actor_role']?.toString() ?? 'unknown';
    final actor = actorName != null && actorName.isNotEmpty
        ? '$actorName ($actorRole)'
        : '(deleted account) ($actorRole)';
    final action = entry['action']?.toString() ?? '';
    final failed = action.endsWith('_failed');
    final storeName = entry['store_name']?.toString();
    final details = _formatDetails(entry['details']);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: failed
                      ? const Color(0xFFFFEDEA)
                      : const Color(0xFFE8F6EC),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  action,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: failed ? Colors.redAccent : Colors.green.shade800,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  actor,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              Text(
                _formatTimestamp(entry['created_at']),
                style: const TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
              ),
            ],
          ),
          if (storeName != null || details.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              [
                if (storeName != null) storeName,
                if (details.isNotEmpty) details,
              ].join(' · '),
              style: const TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPagination() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          '$_total total entr${_total == 1 ? 'y' : 'ies'}',
          style: const TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
        ),
        Row(
          children: [
            IconButton(
              onPressed: _page > 1 ? () => _changePage(-1) : null,
              icon: const Icon(Icons.chevron_left),
            ),
            Text('Page $_page of $_maxPage'),
            IconButton(
              onPressed: _page < _maxPage ? () => _changePage(1) : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
      ],
    );
  }
}
