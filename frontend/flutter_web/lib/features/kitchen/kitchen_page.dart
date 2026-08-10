import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:web/web.dart' as web;

import '../../core/auth/auth_controller.dart';
import '../../core/events/event_stream_client.dart';

/// Dedicated kitchen display. Deliberately a separate page rather than
/// another panel in the admin dashboard: a kitchen screen is mounted, always
/// on, and shouldn't be carrying store/product/coupon management around with
/// it.
class KitchenPage extends StatefulWidget {
  const KitchenPage({super.key});

  @override
  State<KitchenPage> createState() => _KitchenPageState();
}

class _KitchenPageState extends State<KitchenPage> {
  /// Columns, in service order. Completed and cancelled tickets are filtered
  /// out server-side by ?status=active and never appear here.
  static const _columns = ['pending', 'confirmed', 'preparing', 'ready'];

  static const _columnLabels = {
    'pending': 'NEW',
    'confirmed': 'CONFIRMED',
    'preparing': 'PREPARING',
    'ready': 'READY',
  };

  /// Ticket aging thresholds. Named constants so they can move to per-store
  /// configuration later without hunting through widget code.
  static const _amberAfter = Duration(minutes: 5);
  static const _redAfter = Duration(minutes: 8);

  /// Polling is the fallback, not the primary path - when the event stream
  /// is connected this backstop runs slowly, and only tightens up if the
  /// stream drops.
  static const _pollEvery = Duration(seconds: 8);
  static const _pollEveryWhenStreaming = Duration(seconds: 60);

  List<Map<String, dynamic>> _stores = [];
  int? _selectedStoreId;

  List<Map<String, dynamic>> _orders = [];
  Set<int> _knownOrderIds = {};

  bool _loadingStores = true;
  bool _loadingOrders = false;
  String? _error;
  DateTime? _lastUpdated;

  bool _soundEnabled = false;
  web.AudioContext? _audioContext;

  Timer? _ticker;
  int _tickCount = 0;

  EventStreamClient? _events;
  StreamStatus _streamStatus = StreamStatus.connecting;

  @override
  void initState() {
    super.initState();
    _loadStores();

    // A single 1s ticker drives both the elapsed-time labels (which need to
    // update every second to read like a kitchen timer) and the fallback
    // poll.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      _tickCount++;

      final interval = _streamStatus == StreamStatus.connected
          ? _pollEveryWhenStreaming
          : _pollEvery;

      if (_tickCount % interval.inSeconds == 0 && _selectedStoreId != null) {
        _loadOrders(silent: true);
      } else if (mounted) {
        setState(() {}); // refresh elapsed timers / aging colors
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _events?.dispose();
    super.dispose();
  }

  void _subscribeToStoreEvents(int storeId) {
    _events?.dispose();

    _events = EventStreamClient(
      auth: _auth,
      path: '/events/store/$storeId',
      onStatusChanged: (status) {
        if (!mounted) return;
        setState(() => _streamStatus = status);
      },
      onEvent: (event) {
        if (!mounted) return;

        // Refetch rather than merging the pushed order into local state:
        // the event says *something changed*, and a refetch keeps one
        // source of truth instead of two paths that can disagree. At
        // kitchen volumes the extra request is free.
        _loadOrders(silent: true);

        if (event.type == 'order.created') _playAlert();
      },
    )..start();
  }

  AuthController get _auth => context.read<AuthController>();

  Future<void> _loadStores() async {
    try {
      final response = await _auth.authorizedRequest('GET', '/stores');

      if (response.statusCode != 200) {
        setState(() {
          _error = 'Failed to load stores.';
          _loadingStores = false;
        });
        return;
      }

      final decoded = jsonDecode(response.body);
      final loaded = decoded is Map && decoded['stores'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['stores'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      if (!mounted) return;

      setState(() {
        _stores = loaded;
        _selectedStoreId = loaded.isEmpty
            ? null
            : int.tryParse(loaded.first['id'].toString());
        _loadingStores = false;
      });

      if (_selectedStoreId != null) {
        await _loadOrders();
        _subscribeToStoreEvents(_selectedStoreId!);
      }
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = 'Network error while loading stores.';
        _loadingStores = false;
      });
    }
  }

  Future<void> _loadOrders({bool silent = false}) async {
    final storeId = _selectedStoreId;
    if (storeId == null) return;

    if (!silent) setState(() => _loadingOrders = true);

    try {
      final response = await _auth.authorizedRequest(
        'GET',
        '/orders/store/$storeId?status=active',
      );

      if (response.statusCode != 200) {
        if (!mounted) return;
        setState(() {
          _error = 'Failed to load orders.';
          _loadingOrders = false;
        });
        return;
      }

      final decoded = jsonDecode(response.body);
      final loaded = decoded is Map && decoded['orders'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['orders'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      if (!mounted) return;

      final incomingIds = loaded
          .map((order) => int.tryParse(order['id'].toString()))
          .whereType<int>()
          .toSet();

      // Only alert for tickets we've genuinely not seen before - not on the
      // first load, or every arrival would fire at once when the screen
      // starts up.
      final hasNewOrders = _knownOrderIds.isNotEmpty &&
          incomingIds.difference(_knownOrderIds).isNotEmpty;

      setState(() {
        _orders = loaded;
        _knownOrderIds = incomingIds;
        _loadingOrders = false;
        _error = null;
        _lastUpdated = DateTime.now();
      });

      if (hasNewOrders) _playAlert();
    } catch (error) {
      if (!mounted) return;

      setState(() {
        _error = 'Network error while loading orders.';
        _loadingOrders = false;
      });
    }
  }

  Future<void> _setStatus(int orderId, String status) async {
    try {
      final response = await _auth.authorizedRequest(
        'PATCH',
        '/orders/$orderId/status',
        body: {'status': status},
      );

      if (response.statusCode != 200) {
        final decoded = jsonDecode(response.body);
        final message = decoded is Map && decoded['message'] != null
            ? decoded['message'].toString()
            : 'Failed to update the ticket.';

        if (!mounted) return;
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(message)));
        return;
      }

      await _loadOrders(silent: true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Network error updating the ticket.')),
      );
    }
  }

  // Browsers block audio until the user has interacted with the page, so
  // sound is opt-in via an explicit toggle. Enabling it here doubles as the
  // required user gesture that unlocks the AudioContext.
  void _toggleSound() {
    setState(() => _soundEnabled = !_soundEnabled);

    if (_soundEnabled) {
      _audioContext ??= web.AudioContext();
      _playAlert();
    }
  }

  void _playAlert() {
    if (!_soundEnabled) return;

    final context = _audioContext;
    if (context == null) return;

    // Synthesised beep rather than a bundled audio asset - no file to ship,
    // and nothing to fail to load on a kitchen tablet.
    final oscillator = context.createOscillator();
    final gain = context.createGain();

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.frequency.value = 880;
    gain.gain.value = 0.1;

    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  }

  /// Lets the cook mark an item sold out from the pass, where the shortage
  /// is actually discovered - rather than making someone walk to the admin
  /// dashboard mid-service. The 86 expires by itself at end of day.
  Future<void> _showEightySixSheet() async {
    final storeId = _selectedStoreId;
    if (storeId == null) return;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => _EightySixDialog(
        auth: _auth,
        storeId: storeId,
      ),
    );
  }

  void _toggleFullscreen() {
    if (web.document.fullscreenElement == null) {
      web.document.documentElement?.requestFullscreen();
    } else {
      web.document.exitFullscreen();
    }
  }

  Duration _elapsedFor(Map<String, dynamic> order) {
    final createdAt = DateTime.tryParse(order['created_at']?.toString() ?? '');
    if (createdAt == null) return Duration.zero;

    return DateTime.now().difference(createdAt);
  }

  Color _agingColor(Duration elapsed) {
    if (elapsed >= _redAfter) return Colors.red;
    if (elapsed >= _amberAfter) return Colors.orange;
    return Colors.green;
  }

  String _formatElapsed(Duration elapsed) {
    final minutes = elapsed.inMinutes;
    final seconds = elapsed.inSeconds % 60;

    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  /// Total quantity per item across every open ticket - what a prep cook
  /// wants to know ("14 burgers on, total") without adding up cards by eye.
  Map<String, int> get _allDayCounts {
    final counts = <String, int>{};

    for (final order in _orders) {
      final items = order['items'];
      if (items is! List) continue;

      for (final item in items) {
        if (item is! Map) continue;

        final name = item['product_name']?.toString() ?? 'Item';
        final quantity = int.tryParse(item['quantity'].toString()) ?? 0;

        counts.update(name, (value) => value + quantity,
            ifAbsent: () => quantity);
      }
    }

    return counts;
  }

  List<Map<String, dynamic>> _ordersWithStatus(String status) {
    return _orders
        .where((order) => order['status']?.toString() == status)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingStores) {
      return const Scaffold(
        backgroundColor: Color(0xFF1C1B1A),
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      // Dark ground: kitchen screens are usually mounted under bright
      // lights, and a dark field makes the aging colours read at a glance
      // from across the pass.
      backgroundColor: const Color(0xFF1C1B1A),
      body: SafeArea(
        child: Column(
          children: [
            _buildToolbar(),
            if (_error != null)
              Container(
                width: double.infinity,
                color: Colors.red.shade900,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            _buildAllDayStrip(),
            Expanded(child: _buildBoard()),
          ],
        ),
      ),
    );
  }

  Widget _buildToolbar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: const Color(0xFF262524),
      child: Row(
        children: [
          const Icon(Icons.soup_kitchen, color: Colors.deepOrange),
          const SizedBox(width: 10),
          const Text(
            'Kitchen',
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 20),
          if (_stores.length > 1)
            DropdownButton<int>(
              value: _selectedStoreId,
              dropdownColor: const Color(0xFF262524),
              underline: const SizedBox.shrink(),
              style: const TextStyle(color: Colors.white),
              items: _stores.map((store) {
                final id = int.tryParse(store['id'].toString());
                return DropdownMenuItem(
                  value: id,
                  child: Text(store['name']?.toString() ?? 'Store #$id'),
                );
              }).toList(),
              onChanged: (value) {
                if (value == null) return;
                setState(() {
                  _selectedStoreId = value;
                  _orders = [];
                  _knownOrderIds = {};
                });
                _loadOrders();
                _subscribeToStoreEvents(value);
              },
            )
          else if (_stores.length == 1)
            Text(
              _stores.first['name']?.toString() ?? '',
              style: const TextStyle(color: Colors.white70),
            ),
          const Spacer(),
          // A stream that has silently died looks exactly like a quiet
          // kitchen, so surface the connection state rather than leaving
          // staff to wonder why nothing is arriving.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: switch (_streamStatus) {
                StreamStatus.connected => Colors.green.withValues(alpha: 0.15),
                StreamStatus.connecting =>
                  Colors.orange.withValues(alpha: 0.15),
                StreamStatus.disconnected => Colors.red.withValues(alpha: 0.15),
              },
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              switch (_streamStatus) {
                StreamStatus.connected => 'LIVE',
                StreamStatus.connecting => 'CONNECTING',
                StreamStatus.disconnected => 'POLLING',
              },
              style: TextStyle(
                color: switch (_streamStatus) {
                  StreamStatus.connected => Colors.greenAccent,
                  StreamStatus.connecting => Colors.orangeAccent,
                  StreamStatus.disconnected => Colors.redAccent,
                },
                fontSize: 11,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            _lastUpdated == null
                ? 'never updated'
                : 'updated ${_formatElapsed(DateTime.now().difference(_lastUpdated!))} ago',
            style: const TextStyle(color: Colors.white38, fontSize: 12),
          ),
          const SizedBox(width: 12),
          IconButton(
            onPressed: _toggleSound,
            tooltip: _soundEnabled
                ? 'Mute new-order alert'
                : 'Enable new-order alert',
            icon: Icon(
              _soundEnabled ? Icons.volume_up : Icons.volume_off,
              color: _soundEnabled ? Colors.deepOrange : Colors.white38,
            ),
          ),
          IconButton(
            onPressed: _selectedStoreId == null ? null : _showEightySixSheet,
            tooltip: "86 an item (mark sold out)",
            icon: const Icon(Icons.remove_shopping_cart_outlined,
                color: Colors.white70),
          ),
          IconButton(
            onPressed: _toggleFullscreen,
            tooltip: 'Toggle fullscreen',
            icon: const Icon(Icons.fullscreen, color: Colors.white70),
          ),
          IconButton(
            onPressed: _loadingOrders ? null : () => _loadOrders(),
            tooltip: 'Refresh now',
            icon: const Icon(Icons.refresh, color: Colors.white70),
          ),
          IconButton(
            onPressed: () => context.go('/admin'),
            tooltip: 'Back to admin',
            icon: const Icon(Icons.dashboard_outlined, color: Colors.white70),
          ),
        ],
      ),
    );
  }

  Widget _buildAllDayStrip() {
    final counts = _allDayCounts;

    if (counts.isEmpty) return const SizedBox.shrink();

    final entries = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: const Color(0xFF201F1E),
      child: Row(
        children: [
          const Text(
            'ALL DAY',
            style: TextStyle(
              color: Colors.white38,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Wrap(
              spacing: 10,
              runSpacing: 6,
              children: entries.map((entry) {
                return Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF31302E),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${entry.value}× ${entry.key}',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBoard() {
    if (_selectedStoreId == null) {
      return const Center(
        child: Text(
          'No store available for this account.',
          style: TextStyle(color: Colors.white54),
        ),
      );
    }

    if (_orders.isEmpty) {
      return const Center(
        child: Text(
          'No open tickets.',
          style: TextStyle(color: Colors.white38, fontSize: 18),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        // Narrow screens (a phone propped by the pass) get one scrolling
        // list instead of four unreadably thin columns.
        if (constraints.maxWidth < 900) {
          return ListView(
            padding: const EdgeInsets.all(12),
            children: _orders.map(_buildTicket).toList(),
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: _columns.map((status) {
            final orders = _ordersWithStatus(status);

            return Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
                    child: Text(
                      '${_columnLabels[status]}  (${orders.length})',
                      style: const TextStyle(
                        color: Colors.white54,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      children: orders.map(_buildTicket).toList(),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        );
      },
    );
  }

  Widget _buildTicket(Map<String, dynamic> order) {
    final orderId = int.tryParse(order['id'].toString());
    final status = order['status']?.toString() ?? 'pending';
    final elapsed = _elapsedFor(order);
    final agingColor = _agingColor(elapsed);
    final items = order['items'] is List ? List.from(order['items']) : const [];
    final fulfillmentType = order['fulfillment_type']?.toString() ?? 'pickup';
    final orderNotes = order['notes']?.toString();

    final forwardIndex = _columns.indexOf(status);
    final nextStatus =
        forwardIndex >= 0 && forwardIndex < _columns.length - 1
            ? _columns[forwardIndex + 1]
            : 'completed';
    final previousStatus =
        forwardIndex > 0 ? _columns[forwardIndex - 1] : null;

    return Card(
      color: const Color(0xFF2C2B29),
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        // The aging colour lives on the border so it stays legible from a
        // distance without washing out the ticket text.
        side: BorderSide(color: agingColor, width: 2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '#$orderId',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white10,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    switch (fulfillmentType) {
                      'dine_in' => 'TABLE ${order['table_number'] ?? '?'}',
                      'delivery' => 'DELIVERY',
                      _ => 'PICKUP',
                    },
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  _formatElapsed(elapsed),
                  style: TextStyle(
                    color: agingColor,
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...items.map((item) {
              final notes = item['notes']?.toString();
              final mods = item['modifiers'] is List
                  ? List.from(item['modifiers'])
                  : const [];

              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item['quantity']}× ${item['product_name']}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    // Chosen options matter as much as notes for getting the
                    // plate right, so they read the same way.
                    ...mods.map(
                      (m) => Padding(
                        padding: const EdgeInsets.only(left: 12, top: 2),
                        child: Text(
                          '• ${m['group_name']}: ${m['option_name']}',
                          style: const TextStyle(
                            color: Colors.lightBlueAccent,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    if (notes != null && notes.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(left: 12, top: 2),
                        child: Text(
                          '↳ $notes',
                          style: const TextStyle(
                            color: Colors.amberAccent,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
            if (orderNotes != null && orderNotes.isNotEmpty) ...[
              const SizedBox(height: 4),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  orderNotes,
                  style: const TextStyle(
                    color: Colors.amberAccent,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                if (previousStatus != null)
                  IconButton(
                    onPressed: orderId == null
                        ? null
                        : () => _setStatus(orderId, previousStatus),
                    tooltip: 'Recall to ${_columnLabels[previousStatus]}',
                    icon: const Icon(Icons.undo, color: Colors.white38),
                  ),
                const Spacer(),
                FilledButton(
                  onPressed:
                      orderId == null ? null : () => _setStatus(orderId, nextStatus),
                  child: Text(
                    nextStatus == 'completed'
                        ? 'DONE'
                        : 'BUMP → ${_columnLabels[nextStatus]}',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Product list for 86ing, loaded on demand rather than kept in the
/// kitchen page's state - the board polls constantly and doesn't otherwise
/// need the catalogue.
class _EightySixDialog extends StatefulWidget {
  final AuthController auth;
  final int storeId;

  const _EightySixDialog({required this.auth, required this.storeId});

  @override
  State<_EightySixDialog> createState() => _EightySixDialogState();
}

class _EightySixDialogState extends State<_EightySixDialog> {
  List<Map<String, dynamic>> _products = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // The authenticated listing, not the public one - the public menu
      // hides 86'd items, and those are exactly the ones needing a restore
      // button here.
      final response = await widget.auth.authorizedRequest(
        'GET',
        '/products/store/${widget.storeId}',
      );

      if (response.statusCode != 200) {
        setState(() {
          _error = 'Failed to load the menu.';
          _loading = false;
        });
        return;
      }

      final decoded = jsonDecode(response.body);
      final loaded = decoded is Map && decoded['products'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['products'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      if (!mounted) return;

      setState(() {
        _products = loaded;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Network error loading the menu.';
        _loading = false;
      });
    }
  }

  bool _isEightySixed(Map<String, dynamic> product) {
    final until = product['unavailable_until']?.toString();
    if (until == null || until.isEmpty) return false;

    final parsed = DateTime.tryParse(until);
    return parsed != null && parsed.isAfter(DateTime.now());
  }

  Future<void> _setAvailable(int productId, bool available) async {
    try {
      final response = await widget.auth.authorizedRequest(
        'PATCH',
        '/products/$productId/availability',
        body: {'available': available},
      );

      if (response.statusCode != 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update that item.')),
        );
        return;
      }

      await _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Network error updating that item.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Sold out (86)'),
      content: SizedBox(
        width: 480,
        height: 420,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Marking an item sold out hides it from the menu '
                        'straight away. It comes back automatically at the '
                        'end of the day.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF625D5A),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: ListView.builder(
                          itemCount: _products.length,
                          itemBuilder: (context, index) {
                            final product = _products[index];
                            final productId =
                                int.tryParse(product['id'].toString());
                            final off = _isEightySixed(product);

                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                product['name']?.toString() ?? 'Item',
                                style: TextStyle(
                                  decoration:
                                      off ? TextDecoration.lineThrough : null,
                                  color: off ? Colors.grey : null,
                                ),
                              ),
                              subtitle: off
                                  ? const Text(
                                      'Sold out for today',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.redAccent,
                                      ),
                                    )
                                  : null,
                              trailing: productId == null
                                  ? null
                                  : off
                                      ? TextButton(
                                          onPressed: () =>
                                              _setAvailable(productId, true),
                                          child: const Text('Restore'),
                                        )
                                      : OutlinedButton(
                                          onPressed: () =>
                                              _setAvailable(productId, false),
                                          child: const Text('86'),
                                        ),
                            );
                          },
                        ),
                      ),
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
