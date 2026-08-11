import 'dart:convert';

import 'package:http/http.dart' as http;

/// Extracts a safe, user-facing message from a non-2xx response, mirroring
/// ApiClient._decode's shape (the backend's error middleware always returns
/// {message, code, details} for 4xx responses). Falls back to a generic
/// message rather than ever surfacing the raw response body - admin panel
/// code that calls AuthController.authorizedRequest() directly (bypassing
/// ApiClient) previously interpolated response.body straight into the UI,
/// which could be unparsed JSON or an unrelated proxy/server error page.
String responseErrorMessage(http.Response response, String fallback) {
  try {
    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    if (decoded is Map && decoded['message'] != null) {
      return decoded['message'].toString();
    }
  } catch (_) {
    // Not JSON - fall through to the generic message.
  }

  return fallback;
}

/// Safe, generic message for a caught exception (network failure, timeout).
/// Never interpolates the raw exception - it could be a ClientException,
/// FormatException, or TypeError carrying implementation details that
/// aren't meant for an end user.
String networkErrorMessage([
  String fallback = 'Network error. Please check your connection and try again.',
]) {
  return fallback;
}
