import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

import '../../../core/payments/tappay_sdk.dart';

/// Renders TapPay's three hosted card iframes (number, expiry, CCV) inside
/// the Flutter layout.
///
/// Flutter web paints through a canvas, not real DOM - TPDirect targets
/// elements by CSS selector, so those elements have to be genuine DOM nodes
/// registered as platform views, not anything Flutter draws itself. Each
/// instance gets a unique element id so more than one of these could exist
/// without colliding (not expected on checkout, but cheap to make safe).
class CardPaymentFields extends StatefulWidget {
  final int appId;
  final String appKey;
  final String env;

  /// Called once the fields have been bound and TapPay's SDK is ready to be
  /// asked for a prime.
  final VoidCallback onReady;

  const CardPaymentFields({
    super.key,
    required this.appId,
    required this.appKey,
    required this.env,
    required this.onReady,
  });

  @override
  State<CardPaymentFields> createState() => _CardPaymentFieldsState();
}

class _CardPaymentFieldsState extends State<CardPaymentFields> {
  late final String _instanceId;
  late final String _numberId;
  late final String _expirationId;
  late final String _ccvId;
  bool _registered = false;

  @override
  void initState() {
    super.initState();
    _instanceId = DateTime.now().microsecondsSinceEpoch.toString();
    _numberId = 'tappay-number-$_instanceId';
    _expirationId = 'tappay-expiration-$_instanceId';
    _ccvId = 'tappay-ccv-$_instanceId';
    _registerViews();
    _initSdk();
  }

  void _registerViews() {
    _registerDivView('view-$_numberId', _numberId);
    _registerDivView('view-$_expirationId', _expirationId);
    _registerDivView('view-$_ccvId', _ccvId);
    _registered = true;
  }

  void _registerDivView(String viewType, String elementId) {
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int viewId) {
      final element = web.document.createElement('div') as web.HTMLDivElement;
      element.id = elementId;
      element.style.width = '100%';
      element.style.height = '100%';
      return element;
    });
  }

  Future<void> _initSdk() async {
    try {
      await TapPaySdk.setup(
        appId: widget.appId,
        appKey: widget.appKey,
        env: widget.env,
      );

      TapPaySdk.setupCardFields(
        numberElementId: _numberId,
        expirationElementId: _expirationId,
        ccvElementId: _ccvId,
      );

      if (mounted) widget.onReady();
    } catch (_) {
      // The parent's payment step surfaces its own error when getPrime()
      // subsequently fails, so a load failure here doesn't need its own
      // separate error path.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_registered) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Card number', style: TextStyle(fontSize: 12)),
        const SizedBox(height: 4),
        Container(
          height: 44,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade300),
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: HtmlElementView(viewType: 'view-$_numberId'),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Expiry (MM/YY)', style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 4),
                  Container(
                    height: 44,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: HtmlElementView(viewType: 'view-$_expirationId'),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('CCV', style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 4),
                  Container(
                    height: 44,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: HtmlElementView(viewType: 'view-$_ccvId'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}
