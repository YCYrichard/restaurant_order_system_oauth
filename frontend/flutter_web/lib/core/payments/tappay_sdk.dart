import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

// Interop over TapPay's Direct Pay Web SDK (the `TPDirect` global).
//
// The SDK itself is loaded from TapPay's own CDN at runtime, never bundled -
// the backend's CSP change (app.js) is what permits that script to load and
// its iframes to run. This file only talks to whatever TPDirect turns out to
// be; it has no fallback if the script fails to load, which is intentional -
// a checkout page can't silently pretend a card was validated.

class TapPaySdkError extends Error {
  final String message;
  TapPaySdkError(this.message);

  @override
  String toString() => message;
}

@JS('TPDirect.setupSDK')
external void _setupSDK(JSNumber appId, JSString appKey, JSString env);

@JS('TPDirect.card.setup')
external void _cardSetup(JSObject options);

@JS('TPDirect.card.getPrime')
external void _getPrime(JSFunction callback);

@JS('TPDirect.card.getTappayFieldsStatus')
external JSObject _getFieldsStatus();

class TapPaySdk {
  TapPaySdk._();

  static Completer<void>? _scriptLoaded;

  static String _sdkUrl() =>
      'https://js.tappaysdk.com/sdk/tpdirect/v5.19.0';

  static Future<void> _ensureScriptLoaded() {
    final existing = _scriptLoaded;
    if (existing != null) return existing.future;

    final completer = Completer<void>();
    _scriptLoaded = completer;

    final script = web.HTMLScriptElement()
      ..src = _sdkUrl()
      ..type = 'text/javascript';

    script.addEventListener(
      'load',
      (JSAny _) {
        if (!completer.isCompleted) completer.complete();
      }.toJS,
    );

    script.addEventListener(
      'error',
      (JSAny _) {
        if (!completer.isCompleted) {
          completer.completeError(
            TapPaySdkError('Failed to load the TapPay payment SDK'),
          );
        }
      }.toJS,
    );

    web.document.head!.appendChild(script);

    return completer.future;
  }

  /// Loads the SDK (once per page) and initialises it with the deployment's
  /// client keys. Safe to call more than once - repeat calls after the first
  /// successful setup are no-ops from the SDK's own perspective.
  static Future<void> setup({
    required int appId,
    required String appKey,
    required String env,
  }) async {
    await _ensureScriptLoaded();
    _setupSDK(appId.toJS, appKey.toJS, env.toJS);
  }

  static JSObject _fieldConfig({
    required String selector,
    required String placeholder,
  }) {
    final config = JSObject();
    config.setProperty('element'.toJS, selector.toJS);
    config.setProperty('placeholder'.toJS, placeholder.toJS);
    return config;
  }

  /// Binds TapPay's hosted card iframes to three DOM elements already on the
  /// page, selected by CSS id. The elements must exist and be mounted before
  /// this is called - see CardPaymentFields, which creates them via
  /// HtmlElementView (Flutter's canvas-rendered UI isn't real DOM, so
  /// TPDirect can't target it directly without that).
  static void setupCardFields({
    required String numberElementId,
    required String expirationElementId,
    required String ccvElementId,
  }) {
    final fields = JSObject();
    fields.setProperty(
      'number'.toJS,
      _fieldConfig(
        selector: '#$numberElementId',
        placeholder: '**** **** **** ****',
      ),
    );
    fields.setProperty(
      'expirationDate'.toJS,
      _fieldConfig(selector: '#$expirationElementId', placeholder: 'MM / YY'),
    );
    fields.setProperty(
      'ccv'.toJS,
      _fieldConfig(selector: '#$ccvElementId', placeholder: 'CCV'),
    );

    final options = JSObject();
    options.setProperty('fields'.toJS, fields);

    _cardSetup(options);
  }

  /// True once all three fields report themselves valid - mirrors TapPay's
  /// own `canGetPrime` flag, so the pay button can stay disabled until the
  /// card details are actually well-formed rather than only "non-empty".
  static bool canGetPrime() {
    final status = _getFieldsStatus();
    return (status.getProperty('canGetPrime'.toJS) as JSBoolean).toDart;
  }

  /// Tokenises whatever is currently in the card fields into a one-shot
  /// Prime. The Prime - never the card number - is what reaches the backend.
  static Future<String> getPrime() {
    final completer = Completer<String>();

    void handleResult(JSObject result) {
      final status = result.getProperty<JSNumber>('status'.toJS).toDartInt;

      if (status == 0) {
        final card = result.getProperty<JSObject>('card'.toJS);
        final prime = card.getProperty<JSString>('prime'.toJS).toDart;
        completer.complete(prime);
        return;
      }

      final msg = result.getProperty<JSAny?>('msg'.toJS);
      completer.completeError(
        TapPaySdkError(
          msg.isA<JSString>()
              ? (msg as JSString).toDart
              : 'The card details look invalid.',
        ),
      );
    }

    _getPrime(handleResult.toJS);

    return completer.future;
  }
}
