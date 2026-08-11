import 'dart:convert';

import 'package:flutter/material.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/api/response_message.dart';

/// Read-only sales and item reporting for the selected store.
///
/// No charting library - the plan for v1 was inline bars sized off the
/// data's own max value, not a dependency. Good enough to see the shape of
/// a week at a glance without pulling in a whole charting stack for it.
class ReportsPanel extends StatefulWidget {
  final AuthController auth;
  final Map<String, dynamic>? selectedStore;

  const ReportsPanel({
    super.key,
    required this.auth,
    required this.selectedStore,
  });

  @override
  State<ReportsPanel> createState() => _ReportsPanelState();
}

class _ReportsPanelState extends State<ReportsPanel> {
  DateTime _from = DateTime.now().subtract(const Duration(days: 6));
  DateTime _to = DateTime.now();
  String? _fulfillmentType;

  Map<String, dynamic>? _salesReport;
  Map<String, dynamic>? _itemsReport;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ReportsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.selectedStore?['id'] != widget.selectedStore?['id']) {
      _load();
    }
  }

  String _isoDate(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  Future<void> _load() async {
    final storeId = widget.selectedStore?['id'];

    if (storeId == null) {
      setState(() {
        _salesReport = null;
        _itemsReport = null;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final from = _isoDate(_from);
    final to = _isoDate(_to);
    final fulfillmentQuery =
        _fulfillmentType != null ? '&fulfillmentType=$_fulfillmentType' : '';

    try {
      final results = await Future.wait([
        widget.auth.authorizedRequest(
          'GET',
          '/api/v1/reports/sales/store/$storeId?from=$from&to=$to$fulfillmentQuery',
        ),
        widget.auth.authorizedRequest(
          'GET',
          '/api/v1/reports/items/store/$storeId?from=$from&to=$to',
        ),
      ]);

      if (!mounted) return;

      if (results[0].statusCode != 200 || results[1].statusCode != 200) {
        setState(() {
          _error = 'Failed to load the report for this range.';
          _loading = false;
        });
        return;
      }

      setState(() {
        _salesReport = Map<String, dynamic>.from(jsonDecode(results[0].body));
        _itemsReport = Map<String, dynamic>.from(jsonDecode(results[1].body));
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = networkErrorMessage();
        _loading = false;
      });
    }
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? _from : _to,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );

    if (picked == null) return;

    setState(() {
      if (isFrom) {
        _from = picked;
      } else {
        _to = picked;
      }
    });

    _load();
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
                    'Reports',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh reports',
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (widget.selectedStore == null)
              _buildEmptyState('Select a store to see its reports.')
            else ...[
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
              else if (_salesReport != null) ...[
                _buildSummary(),
                const SizedBox(height: 20),
                _buildByDay(),
                const SizedBox(height: 20),
                _buildByHour(),
                const SizedBox(height: 20),
                _buildByFulfillmentType(),
                const SizedBox(height: 20),
                _buildBestWorstSellers(),
              ],
            ],
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

  Widget _buildFilters() {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        OutlinedButton.icon(
          onPressed: () => _pickDate(isFrom: true),
          icon: const Icon(Icons.calendar_today, size: 16),
          label: Text('From ${_isoDate(_from)}'),
        ),
        OutlinedButton.icon(
          onPressed: () => _pickDate(isFrom: false),
          icon: const Icon(Icons.calendar_today, size: 16),
          label: Text('To ${_isoDate(_to)}'),
        ),
        DropdownButton<String?>(
          value: _fulfillmentType,
          hint: const Text('All fulfillment types'),
          items: const [
            DropdownMenuItem(value: null, child: Text('All fulfillment types')),
            DropdownMenuItem(value: 'pickup', child: Text('Pickup')),
            DropdownMenuItem(value: 'dine_in', child: Text('Dine in')),
          ],
          onChanged: (value) {
            setState(() => _fulfillmentType = value);
            _load();
          },
        ),
      ],
    );
  }

  Widget _buildSummary() {
    final summary = Map<String, dynamic>.from(_salesReport!['summary']);

    double asDouble(String key) => double.tryParse('${summary[key]}') ?? 0;

    return Wrap(
      spacing: 24,
      runSpacing: 16,
      children: [
        _statTile('Revenue', '\$${asDouble('revenue').toStringAsFixed(2)}'),
        _statTile(
          'Net (after refunds)',
          '\$${asDouble('netRevenue').toStringAsFixed(2)}',
        ),
        _statTile('Orders', '${summary['orderCount'] ?? 0}'),
        _statTile(
          'Avg order value',
          '\$${asDouble('avgOrderValue').toStringAsFixed(2)}',
        ),
        _statTile(
          'Refunded',
          '\$${asDouble('refundAmount').toStringAsFixed(2)} '
              '(${summary['refundCount'] ?? 0})',
        ),
      ],
    );
  }

  Widget _statTile(String label, String value) {
    return SizedBox(
      width: 160,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: Colors.deepOrange,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
          ),
        ],
      ),
    );
  }

  Widget _buildByDay() {
    final byDay = List<Map<String, dynamic>>.from(
      (_salesReport!['byDay'] as List).map((d) => Map<String, dynamic>.from(d)),
    );

    if (byDay.isEmpty) return const SizedBox.shrink();

    final maxRevenue = byDay.fold<double>(
      0,
      (max, d) => (double.tryParse('${d['revenue']}') ?? 0) > max
          ? double.tryParse('${d['revenue']}') ?? 0
          : max,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('By day', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        ...byDay.map((d) {
          final revenue = double.tryParse('${d['revenue']}') ?? 0;
          final fraction = maxRevenue > 0 ? revenue / maxRevenue : 0.0;

          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                SizedBox(
                  width: 90,
                  child: Text(
                    '${d['date']}',
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                Expanded(
                  child: Stack(
                    children: [
                      Container(
                        height: 18,
                        decoration: BoxDecoration(
                          color: const Color(0xFFF3F1EE),
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: fraction.clamp(0, 1),
                        child: Container(
                          height: 18,
                          decoration: BoxDecoration(
                            color: Colors.deepOrange,
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 90,
                  child: Text(
                    '\$${revenue.toStringAsFixed(2)} · ${d['orderCount']}',
                    style: const TextStyle(fontSize: 12),
                    textAlign: TextAlign.right,
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildByHour() {
    final byHour = List<Map<String, dynamic>>.from(
      (_salesReport!['byHour'] as List).map((h) => Map<String, dynamic>.from(h)),
    );

    final maxRevenue = byHour.fold<double>(
      0,
      (max, h) => (double.tryParse('${h['revenue']}') ?? 0) > max
          ? double.tryParse('${h['revenue']}') ?? 0
          : max,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('By hour of day',
            style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        SizedBox(
          height: 80,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: byHour.map((h) {
              final revenue = double.tryParse('${h['revenue']}') ?? 0;
              final fraction = maxRevenue > 0 ? revenue / maxRevenue : 0.0;

              return Expanded(
                child: Tooltip(
                  message: '${h['hour']}:00 — \$${revenue.toStringAsFixed(2)}',
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Container(
                          height: 56 * fraction.clamp(0.03, 1),
                          decoration: BoxDecoration(
                            color: revenue > 0
                                ? Colors.deepOrange
                                : const Color(0xFFF3F1EE),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        Row(
          children: const [
            Text('0h', style: TextStyle(fontSize: 10, color: Color(0xFF9A948F))),
            Spacer(),
            Text('23h',
                style: TextStyle(fontSize: 10, color: Color(0xFF9A948F))),
          ],
        ),
      ],
    );
  }

  Widget _buildByFulfillmentType() {
    final rows = List<Map<String, dynamic>>.from(
      (_salesReport!['byFulfillmentType'] as List)
          .map((f) => Map<String, dynamic>.from(f)),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('By fulfillment type',
            style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: rows.map((row) {
            final revenue = double.tryParse('${row['revenue']}') ?? 0;

            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFFAFAFA),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${row['fulfillmentType']}'.replaceAll('_', ' '),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    '\$${revenue.toStringAsFixed(2)} · ${row['orderCount']} orders',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF625D5A),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildBestWorstSellers() {
    final best = List<Map<String, dynamic>>.from(
      (_itemsReport?['bestSellers'] as List? ?? [])
          .map((i) => Map<String, dynamic>.from(i)),
    );
    final worst = List<Map<String, dynamic>>.from(
      (_itemsReport?['worstSellers'] as List? ?? [])
          .map((i) => Map<String, dynamic>.from(i)),
    );

    if (best.isEmpty) {
      return _buildEmptyState('No completed sales in this range yet.');
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= 640;
        final columns = [
          Expanded(child: _sellerList('Best sellers', best)),
          const SizedBox(width: 20, height: 20),
          Expanded(child: _sellerList('Worst sellers', worst)),
        ];

        return isWide ? Row(children: columns) : Column(children: columns);
      },
    );
  }

  Widget _sellerList(String title, List<Map<String, dynamic>> items) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        ...items.map((item) {
          final revenue = double.tryParse('${item['revenue']}') ?? 0;

          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${item['name']}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  '${item['quantitySold']} sold',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF625D5A)),
                ),
                const SizedBox(width: 8),
                Text(
                  '\$${revenue.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
