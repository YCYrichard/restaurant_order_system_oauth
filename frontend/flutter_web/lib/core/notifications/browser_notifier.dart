import 'dart:js_interop';

import 'package:web/web.dart' as web;

/// Thin wrapper over the browser Notification API.
///
/// Permission is requested contextually - right after a customer places an
/// order, where "we'll tell you when it's ready" is a reason to say yes -
/// never on page load, which just trains people to reflexively dismiss
/// every prompt a site shows them. Any browser without the API (or a user
/// who denies it) degrades silently to no notification; the in-page alert
/// on My Orders is still the primary channel.
class BrowserNotifier {
  static Future<void> requestPermissionIfNeeded() async {
    try {
      if (web.Notification.permission == 'default') {
        await web.Notification.requestPermission().toDart;
      }
    } catch (_) {
      // Notification API unavailable in this browser - nothing to do.
    }
  }

  static void show(String title, {String? body}) {
    try {
      if (web.Notification.permission != 'granted') return;
      web.Notification(title, web.NotificationOptions(body: body ?? ''));
    } catch (_) {
      // Unavailable or blocked - the in-page alert still covers this.
    }
  }
}
