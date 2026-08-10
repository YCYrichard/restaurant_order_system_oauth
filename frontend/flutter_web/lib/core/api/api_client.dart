import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants/app_config.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final String? code;

  ApiException({
    required this.statusCode,
    required this.message,
    this.code,
  });

  @override
  String toString() => message;
}

/// Thin, shared foundation for calling the backend from the customer-facing
/// (public, unauthenticated) screens. Centralizes the base URL, JSON
/// decoding, and error shaping so callers don't hand-roll the same
/// try/catch + status-code check per screen.
class ApiClient {
  static Future<dynamic> getJson(String path) async {
    final http.Response response;

    try {
      response = await http.get(
        Uri.parse('$apiBaseUrl$path'),
        headers: {'Accept': 'application/json'},
      );
    } catch (_) {
      throw ApiException(
        statusCode: 0,
        message: 'Unable to connect to the server. Please try again.',
      );
    }

    return _decode(response);
  }

  static Future<dynamic> postJson(String path, Map<String, dynamic> body) async {
    final http.Response response;

    try {
      response = await http.post(
        Uri.parse('$apiBaseUrl$path'),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(body),
      );
    } catch (_) {
      throw ApiException(
        statusCode: 0,
        message: 'Unable to connect to the server. Please try again.',
      );
    }

    return _decode(response);
  }

  static dynamic _decode(http.Response response) {
    dynamic decoded;

    try {
      decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    } catch (_) {
      decoded = null;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = (decoded is Map && decoded['message'] != null)
          ? decoded['message'].toString()
          : 'Request failed with status ${response.statusCode}.';

      final code = (decoded is Map && decoded['code'] != null)
          ? decoded['code'].toString()
          : null;

      throw ApiException(
        statusCode: response.statusCode,
        message: message,
        code: code,
      );
    }

    return decoded;
  }
}
