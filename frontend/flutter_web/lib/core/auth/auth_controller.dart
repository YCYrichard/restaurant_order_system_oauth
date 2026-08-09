import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

import '../../jwt_decode.dart';
import '../constants/app_config.dart';

/// Single source of truth for the current session. Previously each screen
/// (RoleRouterPage, AdminPage, AdminLoginPage, HomePage) independently read
/// and JWT-decoded localStorage, so there was no one place that actually
/// knew "is the user logged in right now."
///
/// Also owns the credentialed HTTP client used for /auth/refresh and
/// /auth/logout: the refresh token lives in an HttpOnly cookie the browser
/// manages, but `withCredentials` has to be explicitly enabled for a
/// cross-origin fetch to send/receive it.
class AuthController extends ChangeNotifier {
  static const _tokenKey = 'auth_token';
  static const _roleKey = 'auth_role';
  static const _nameKey = 'auth_name';

  final BrowserClient _client = BrowserClient()..withCredentials = true;

  String? _token;
  String? _role;
  String? _name;
  int? _userId;

  AuthController() {
    _restoreFromStorage();
  }

  String? get token => _token;
  String? get role => _role;
  String? get name => _name;
  int? get userId => _userId;
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;
  bool get isAdmin => _role == 'admin';

  void _restoreFromStorage() {
    final storedToken = web.window.localStorage.getItem(_tokenKey);

    if (storedToken != null && storedToken.isNotEmpty) {
      _applyToken(storedToken, persist: false);
    }
  }

  void _applyToken(String token, {bool persist = true}) {
    final payload = JwtPayload.fromToken(token);

    _token = token;
    _role = payload.role;
    _name = payload.name;
    _userId = payload.id;

    if (persist) {
      web.window.localStorage.setItem(_tokenKey, token);
      web.window.localStorage.setItem(_roleKey, _role ?? '');
      web.window.localStorage.setItem(_nameKey, _name ?? '');
    }
  }

  /// Credentialed POST for auth-adjacent endpoints (e.g. admin-login) that
  /// need the browser to accept the Set-Cookie refresh token on the
  /// response. Callers own decoding the response body themselves.
  Future<http.Response> post(String path, {Map<String, dynamic>? body}) {
    return _client.post(
      Uri.parse('$apiBaseUrl$path'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body != null ? jsonEncode(body) : null,
    );
  }

  /// Called after any successful login (OAuth callback or admin login).
  void setSession(String token) {
    _applyToken(token);
    notifyListeners();
  }

  /// Attempts to silently obtain a new access token using the refresh
  /// cookie. Returns whether it succeeded - callers decide what to do on
  /// failure (typically: fall back to sending the user to a login screen).
  Future<bool> refresh() async {
    try {
      final response = await _client.post(
        Uri.parse('$apiBaseUrl/auth/refresh'),
        headers: {'Accept': 'application/json'},
      );

      if (response.statusCode != 200) {
        return false;
      }

      final decoded = jsonDecode(response.body);
      final newToken =
          decoded is Map ? decoded['token']?.toString() : null;

      if (newToken == null || newToken.isEmpty) {
        return false;
      }

      _applyToken(newToken);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _client.post(
        Uri.parse('$apiBaseUrl/auth/logout'),
        headers: {'Accept': 'application/json'},
      );
    } catch (_) {
      // Best-effort - clear local state regardless of network outcome.
    }

    _token = null;
    _role = null;
    _name = null;
    _userId = null;

    web.window.localStorage.removeItem(_tokenKey);
    web.window.localStorage.removeItem(_roleKey);
    web.window.localStorage.removeItem(_nameKey);

    notifyListeners();
  }
}
