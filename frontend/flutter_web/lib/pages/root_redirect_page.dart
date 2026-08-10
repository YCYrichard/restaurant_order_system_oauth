import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api/api_client.dart';

/// `/` is not a customer entry point - each store is reached through its own
/// QR code or link (`/store/:storeId`), never an in-app picker. This page
/// only exists to handle someone landing on the bare domain: if there's
/// exactly one active store, send them straight there; otherwise explain
/// how ordering actually works here instead of showing an empty picker.
class RootRedirectPage extends StatefulWidget {
  const RootRedirectPage({super.key});

  @override
  State<RootRedirectPage> createState() => _RootRedirectPageState();
}

class _RootRedirectPageState extends State<RootRedirectPage> {
  bool _loading = true;
  bool _multipleStores = false;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    try {
      final decoded = await ApiClient.getJson('/stores/public');
      final stores = decoded is Map && decoded['stores'] is List
          ? List<Map<String, dynamic>>.from(
              (decoded['stores'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item)),
            )
          : <Map<String, dynamic>>[];

      if (!mounted) return;

      if (stores.length == 1) {
        final id = stores.first['id'];
        if (id != null) {
          context.go('/store/$id');
          return;
        }
      }

      setState(() {
        _multipleStores = stores.length > 1;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.qr_code_2, size: 56, color: Colors.deepOrange),
                const SizedBox(height: 20),
                Text(
                  _multipleStores
                      ? 'This link needs a specific restaurant.'
                      : 'No restaurant is set up for ordering yet.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _multipleStores
                      ? "Scan your restaurant's QR code, or use the ordering "
                          'link your restaurant gave you.'
                      : 'Check back soon, or ask the restaurant for their '
                          'ordering link.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF625D5A),
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
