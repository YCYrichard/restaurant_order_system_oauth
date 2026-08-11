import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/api/response_message.dart';
import '../../../core/auth/auth_controller.dart';

/// Opening hours and holiday closures for the selected store.
///
/// A store with no hours saved is treated as always open by the backend, so
/// this panel is opt-in configuration rather than something every store must
/// fill in before it can trade.
class StoreHoursPanel extends StatefulWidget {
  final Map<String, dynamic>? selectedStore;

  const StoreHoursPanel({super.key, required this.selectedStore});

  @override
  State<StoreHoursPanel> createState() => _StoreHoursPanelState();
}

class _StoreHoursPanelState extends State<StoreHoursPanel> {
  static const _dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  // Index 0-6, Sunday first, matching the backend's day_of_week.
  late List<_DayRow> _days;
  List<Map<String, dynamic>> _closures = [];

  final _taxRateController = TextEditingController(text: '0');
  bool _taxInclusive = true;

  final _minPrepController = TextEditingController(text: '15');

  bool _einvoiceEnabled = false;
  final _einvoiceTaxIdController = TextEditingController();

  bool _loading = false;
  bool _saving = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _days = List.generate(7, (index) => _DayRow(dayOfWeek: index));
    _load();
  }

  @override
  void dispose() {
    _taxRateController.dispose();
    _minPrepController.dispose();
    _einvoiceTaxIdController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant StoreHoursPanel oldWidget) {
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
    if (storeId == null) return;

    // Tax and prep time come from the store record already loaded by the
    // admin page.
    final rate = double.tryParse('${widget.selectedStore?['tax_rate'] ?? 0}') ?? 0;
    _taxRateController.text = (rate * 100).toStringAsFixed(2);
    _taxInclusive = widget.selectedStore?['tax_inclusive'] != 0 &&
        widget.selectedStore?['tax_inclusive'] != false;

    final minPrep =
        int.tryParse('${widget.selectedStore?['min_prep_minutes'] ?? 15}') ??
            15;
    _minPrepController.text = '$minPrep';

    final einvoiceEnabledRaw = widget.selectedStore?['einvoice_enabled'];
    _einvoiceEnabled = einvoiceEnabledRaw == true ||
        einvoiceEnabledRaw == 1 ||
        einvoiceEnabledRaw == '1';
    _einvoiceTaxIdController.text =
        widget.selectedStore?['einvoice_tax_id']?.toString() ?? '';

    setState(() => _loading = true);

    try {
      final response =
          await _auth.authorizedRequest('GET', '/stores/$storeId/hours');

      if (response.statusCode != 200) {
        _showMessage('Failed to load hours.', isError: true);
        setState(() => _loading = false);
        return;
      }

      final decoded = jsonDecode(response.body);
      final hours = decoded is Map && decoded['hours'] is List
          ? decoded['hours'] as List
          : const [];
      final closures = decoded is Map && decoded['closures'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['closures'] as List)
                  .whereType<Map>()
                  .map((c) => Map<String, dynamic>.from(c)),
            )
          : <Map<String, dynamic>>[];

      final rows = List.generate(7, (index) => _DayRow(dayOfWeek: index));

      for (final entry in hours) {
        if (entry is! Map) continue;
        final day = int.tryParse(entry['day_of_week'].toString());
        if (day == null || day < 0 || day > 6) continue;

        rows[day] = _DayRow(
          dayOfWeek: day,
          isClosed: entry['is_closed'] == 1 || entry['is_closed'] == true,
          openTime: '${entry['open_time']}'.substring(0, 5),
          closeTime: '${entry['close_time']}'.substring(0, 5),
          configured: true,
        );
      }

      if (!mounted) return;

      setState(() {
        _days = rows;
        _closures = closures;
        _loading = false;
      });
    } catch (error) {
      setState(() => _loading = false);
      _showMessage(networkErrorMessage(), isError: true);
    }
  }

  Future<void> _save() async {
    final storeId = widget.selectedStore?['id'];
    if (storeId == null) return;

    setState(() => _saving = true);

    try {
      final response = await _auth.authorizedRequest(
        'PUT',
        '/stores/$storeId/hours',
        body: {
          'hours': _days
              .map((day) => {
                    'dayOfWeek': day.dayOfWeek,
                    'isClosed': day.isClosed,
                    'openTime': day.openTime,
                    'closeTime': day.closeTime,
                  })
              .toList(),
        },
      );

      if (response.statusCode != 200) {
        final decoded = jsonDecode(response.body);
        _showMessage(
          decoded is Map && decoded['message'] != null
              ? decoded['message'].toString()
              : 'Failed to save hours.',
          isError: true,
        );
        setState(() => _saving = false);
        return;
      }

      setState(() => _saving = false);
      _showMessage('Hours saved.');
      await _load();
    } catch (error) {
      setState(() => _saving = false);
      _showMessage(networkErrorMessage(), isError: true);
    }
  }

  /// Tax lives on the store record, so it saves through the store update
  /// endpoint rather than the hours one.
  Future<void> _saveTax() async {
    final store = widget.selectedStore;
    if (store == null) return;

    final percent = double.tryParse(_taxRateController.text.trim()) ?? 0;

    final response = await _auth.authorizedRequest(
      'PUT',
      '/stores/${store['id']}',
      body: {
        'name': store['name'],
        'address': store['address'],
        'phone': store['phone'],
        // The API takes a fraction; the field asks for a percentage because
        // that's how a shop owner thinks about it.
        'taxRate': percent / 100,
        'taxInclusive': _taxInclusive,
      },
    );

    if (response.statusCode == 200) {
      _showMessage('Tax settings saved.');
    } else {
      _showMessage('Failed to save tax settings.', isError: true);
    }
  }

  /// Also lives on the store record, alongside tax - saved the same way.
  Future<void> _savePrepTime() async {
    final store = widget.selectedStore;
    if (store == null) return;

    final minutes = int.tryParse(_minPrepController.text.trim());

    if (minutes == null || minutes < 0 || minutes > 240) {
      _showMessage(
        'Prep time must be a whole number of minutes (0-240).',
        isError: true,
      );
      return;
    }

    final response = await _auth.authorizedRequest(
      'PUT',
      '/stores/${store['id']}',
      body: {
        'name': store['name'],
        'address': store['address'],
        'phone': store['phone'],
        'minPrepMinutes': minutes,
      },
    );

    if (response.statusCode == 200) {
      _showMessage('Prep time saved.');
    } else {
      _showMessage('Failed to save prep time.', isError: true);
    }
  }

  /// Also lives on the store record, saved the same way as tax and prep
  /// time above.
  Future<void> _saveEinvoice() async {
    final store = widget.selectedStore;
    if (store == null) return;

    final taxId = _einvoiceTaxIdController.text.trim();

    if (_einvoiceEnabled && taxId.isEmpty) {
      _showMessage(
        "Add this store's tax ID before enabling e-invoicing.",
        isError: true,
      );
      return;
    }

    final response = await _auth.authorizedRequest(
      'PUT',
      '/stores/${store['id']}',
      body: {
        'name': store['name'],
        'address': store['address'],
        'phone': store['phone'],
        'einvoiceEnabled': _einvoiceEnabled,
        'einvoiceTaxId': taxId,
      },
    );

    if (response.statusCode == 200) {
      _showMessage('E-invoice settings saved.');
    } else {
      _showMessage(
        responseErrorMessage(response, 'Failed to save e-invoice settings.'),
        isError: true,
      );
    }
  }

  Future<void> _clearHours() async {
    final storeId = widget.selectedStore?['id'];
    if (storeId == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Always open?'),
        content: const Text(
          'Removing all hours means this store never shows as closed and '
          'always accepts orders. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Remove hours'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final response = await _auth.authorizedRequest(
      'PUT',
      '/stores/$storeId/hours',
      body: {'hours': []},
    );

    if (response.statusCode == 200) {
      _showMessage('Hours removed — this store is always open.');
      await _load();
    }
  }

  Future<void> _addClosure() async {
    final storeId = widget.selectedStore?['id'];
    if (storeId == null) return;

    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDate: DateTime.now(),
    );

    if (picked == null || !mounted) return;

    final reasonController = TextEditingController();
    final reason = await showDialog<String?>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Closure reason'),
        content: TextField(
          controller: reasonController,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'e.g. Lunar New Year',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.of(dialogContext).pop(reasonController.text),
            child: const Text('Add'),
          ),
        ],
      ),
    );

    if (reason == null) return;

    final isoDate = '${picked.year.toString().padLeft(4, '0')}-'
        '${picked.month.toString().padLeft(2, '0')}-'
        '${picked.day.toString().padLeft(2, '0')}';

    final response = await _auth.authorizedRequest(
      'POST',
      '/stores/$storeId/closures',
      body: {'date': isoDate, 'reason': reason},
    );

    if (response.statusCode == 201) {
      _showMessage('Closure added for $isoDate.');
      await _load();
    } else {
      _showMessage('Failed to add closure.', isError: true);
    }
  }

  Future<void> _removeClosure(String date) async {
    final storeId = widget.selectedStore?['id'];
    if (storeId == null) return;

    final response = await _auth.authorizedRequest(
      'DELETE',
      '/stores/$storeId/closures/$date',
    );

    if (response.statusCode == 200) {
      await _load();
    }
  }

  Future<void> _pickTime(_DayRow day, {required bool isOpenTime}) async {
    final current = isOpenTime ? day.openTime : day.closeTime;
    final parts = current.split(':');

    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(
        hour: int.tryParse(parts.first) ?? 9,
        minute: int.tryParse(parts.last) ?? 0,
      ),
    );

    if (picked == null) return;

    final formatted = '${picked.hour.toString().padLeft(2, '0')}:'
        '${picked.minute.toString().padLeft(2, '0')}';

    setState(() {
      if (isOpenTime) {
        day.openTime = formatted;
      } else {
        day.closeTime = formatted;
      }
    });
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
                    'Opening Hours',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh hours',
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Orders are refused while the store is closed. A store with no '
              'hours set is always open.',
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
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFFFAFAFA),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'Select a store to set its hours.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF625D5A)),
                ),
              )
            else if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              )
            else ...[
              ..._days.map(_buildDayRow),
              const SizedBox(height: 12),
              Row(
                children: [
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: const Icon(Icons.save),
                    label: Text(_saving ? 'Saving...' : 'Save hours'),
                  ),
                  const SizedBox(width: 12),
                  TextButton(
                    onPressed: _saving ? null : _clearHours,
                    child: const Text('Always open'),
                  ),
                ],
              ),
              const Divider(height: 32),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Holiday closures',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _addClosure,
                    icon: const Icon(Icons.event_busy, size: 18),
                    label: const Text('Add'),
                  ),
                ],
              ),
              if (_closures.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'No upcoming closures.',
                    style: TextStyle(color: Color(0xFF77716D), fontSize: 13),
                  ),
                )
              else
                ..._closures.map((closure) {
                  final date =
                      closure['closure_date'].toString().split('T').first;

                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: const Icon(Icons.event_busy, size: 20),
                    title: Text(date),
                    subtitle: Text(closure['reason']?.toString() ?? ''),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => _removeClosure(date),
                    ),
                  );
                }),

              const Divider(height: 32),
              const Text(
                'Tax',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              const Text(
                'Taiwan business tax is normally inclusive: the menu price '
                'already contains the tax and the receipt breaks it out. '
                'Exclusive adds it on top at checkout.',
                style: TextStyle(fontSize: 12, color: Color(0xFF77716D)),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  SizedBox(
                    width: 160,
                    child: TextField(
                      controller: _taxRateController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Rate % (e.g. 5)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _taxInclusive,
                      onChanged: (value) =>
                          setState(() => _taxInclusive = value),
                      title: Text(
                        _taxInclusive
                            ? 'Prices include tax'
                            : 'Tax added at checkout',
                      ),
                    ),
                  ),
                  FilledButton(
                    onPressed: _saveTax,
                    child: const Text('Save tax'),
                  ),
                ],
              ),

              const Divider(height: 32),
              const Text(
                'Electronic invoice (電子發票)',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              const Text(
                'Only required if this store issues Uniform Invoices. '
                'Businesses averaging under NT\$200,000 a month are exempt '
                '(小規模營業人) and can leave this off. Turning it on prompts '
                'for a buyer tax ID or a donation choice at checkout and '
                'tracks which orders still need an invoice recorded - it '
                "does not transmit anything to the Ministry of Finance or "
                'a provider on its own, so record the real invoice number '
                'here once one is issued through your own system.',
                style: TextStyle(fontSize: 12, color: Color(0xFF77716D)),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _einvoiceEnabled,
                onChanged: (value) => setState(() => _einvoiceEnabled = value),
                title: const Text('Issue electronic invoices for this store'),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  SizedBox(
                    width: 220,
                    child: TextField(
                      controller: _einvoiceTaxIdController,
                      keyboardType: TextInputType.number,
                      maxLength: 8,
                      decoration: const InputDecoration(
                        labelText: 'Store tax ID (統一編號, 8 digits)',
                        border: OutlineInputBorder(),
                        counterText: '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  FilledButton(
                    onPressed: _saveEinvoice,
                    child: const Text('Save e-invoice settings'),
                  ),
                ],
              ),

              const Divider(height: 32),
              const Text(
                'Pickup prep time',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              const Text(
                'The earliest a customer can choose to have their order '
                'ready is now plus this many minutes. ASAP orders use this '
                'as their estimate too.',
                style: TextStyle(fontSize: 12, color: Color(0xFF77716D)),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  SizedBox(
                    width: 160,
                    child: TextField(
                      controller: _minPrepController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Minutes',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  FilledButton(
                    onPressed: _savePrepTime,
                    child: const Text('Save prep time'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDayRow(_DayRow day) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(
              _dayNames[day.dayOfWeek],
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          Switch(
            value: !day.isClosed,
            onChanged: (open) => setState(() => day.isClosed = !open),
          ),
          const SizedBox(width: 8),
          if (day.isClosed)
            const Text(
              'Closed',
              style: TextStyle(color: Color(0xFF77716D)),
            )
          else ...[
            OutlinedButton(
              onPressed: () => _pickTime(day, isOpenTime: true),
              child: Text(day.openTime),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('to'),
            ),
            OutlinedButton(
              onPressed: () => _pickTime(day, isOpenTime: false),
              child: Text(day.closeTime),
            ),
          ],
        ],
      ),
    );
  }
}

class _DayRow {
  final int dayOfWeek;
  bool isClosed;
  String openTime;
  String closeTime;
  final bool configured;

  _DayRow({
    required this.dayOfWeek,
    this.isClosed = false,
    this.openTime = '09:00',
    this.closeTime = '21:00',
    this.configured = false,
  });
}
