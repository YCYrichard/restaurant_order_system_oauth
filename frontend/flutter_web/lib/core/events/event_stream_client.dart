import 'dart:async';
import 'dart:convert';

import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

import '../auth/auth_controller.dart';
import '../constants/app_config.dart';

class ServerEvent {
  final String type;
  final Map<String, dynamic> data;

  const ServerEvent(this.type, this.data);
}

enum StreamStatus { connecting, connected, disconnected }

/// Server-Sent Events client for order updates.
///
/// Deliberately does NOT use the browser's `EventSource`: that API cannot
/// set an `Authorization` header, and the usual workaround - putting the
/// token in the query string - leaks credentials into server logs, proxy
/// logs and referrers. Streaming the response via `BrowserClient.send()`
/// keeps the token in a header where it belongs, at the cost of parsing SSE
/// frames here rather than getting that for free.
class EventStreamClient {
  /// Access tokens last 15 minutes. Reconnecting well before that keeps the
  /// stream on a fresh token, and means a revoked session stops streaming
  /// within one cycle rather than lingering for the life of the connection.
  static const _reconnectBefore = Duration(minutes: 10);

  static const _initialBackoff = Duration(seconds: 2);
  static const _maxBackoff = Duration(seconds: 30);

  final AuthController auth;
  final String path;
  final void Function(ServerEvent event) onEvent;
  final void Function(StreamStatus status)? onStatusChanged;

  BrowserClient? _client;
  StreamSubscription<String>? _subscription;
  Timer? _reconnectTimer;
  Timer? _rotationTimer;
  Duration _backoff = _initialBackoff;
  bool _disposed = false;

  EventStreamClient({
    required this.auth,
    required this.path,
    required this.onEvent,
    this.onStatusChanged,
  });

  void start() {
    _disposed = false;
    _connect();
  }

  Future<void> _connect() async {
    if (_disposed) return;

    _teardownConnection();
    onStatusChanged?.call(StreamStatus.connecting);

    final token = auth.token;

    if (token == null || token.isEmpty) {
      _scheduleReconnect();
      return;
    }

    final client = BrowserClient()..withCredentials = true;
    _client = client;

    try {
      final request = http.Request('GET', Uri.parse('$apiBaseUrl$path'))
        ..headers['Accept'] = 'text/event-stream'
        ..headers['Authorization'] = 'Bearer $token';

      final response = await client.send(request);

      if (response.statusCode == 401 || response.statusCode == 403) {
        // The stream itself can't retry a request mid-flight, so refresh
        // here and let the reconnect pick up the new token.
        final refreshed = await auth.refresh();
        _scheduleReconnect(immediate: refreshed);
        return;
      }

      if (response.statusCode != 200) {
        _scheduleReconnect();
        return;
      }

      onStatusChanged?.call(StreamStatus.connected);
      _backoff = _initialBackoff;

      // Rotate onto a fresh token before the current one expires.
      _rotationTimer = Timer(_reconnectBefore, () {
        if (!_disposed) _connect();
      });

      var eventType = 'message';
      final dataLines = <String>[];

      _subscription = response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
        (line) {
          // Blank line terminates a frame.
          if (line.isEmpty) {
            if (dataLines.isNotEmpty) {
              _dispatch(eventType, dataLines.join('\n'));
            }
            eventType = 'message';
            dataLines.clear();
            return;
          }

          // ':' prefixed lines are comments - the server's heartbeat rides
          // on these, and they exist only to keep proxies from closing an
          // idle stream.
          if (line.startsWith(':')) return;

          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.add(line.substring(5).trim());
          }
        },
        onDone: () {
          onStatusChanged?.call(StreamStatus.disconnected);
          _scheduleReconnect();
        },
        onError: (_) {
          onStatusChanged?.call(StreamStatus.disconnected);
          _scheduleReconnect();
        },
        cancelOnError: true,
      );
    } catch (_) {
      onStatusChanged?.call(StreamStatus.disconnected);
      _scheduleReconnect();
    }
  }

  void _dispatch(String type, String payload) {
    try {
      final decoded = jsonDecode(payload);

      if (decoded is Map<String, dynamic>) {
        onEvent(ServerEvent(type, decoded));
      }
    } catch (_) {
      // A malformed frame shouldn't kill the stream - skip it.
    }
  }

  void _scheduleReconnect({bool immediate = false}) {
    if (_disposed) return;

    _teardownConnection();
    _reconnectTimer?.cancel();

    final delay = immediate ? Duration.zero : _backoff;

    _reconnectTimer = Timer(delay, () {
      if (!_disposed) _connect();
    });

    // Exponential backoff so a server that's down doesn't get hammered by
    // every kitchen screen in the building.
    final next = _backoff * 2;
    _backoff = next > _maxBackoff ? _maxBackoff : next;
  }

  void _teardownConnection() {
    _rotationTimer?.cancel();
    _rotationTimer = null;
    _subscription?.cancel();
    _subscription = null;
    _client?.close();
    _client = null;
  }

  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _teardownConnection();
  }
}
