import 'dart:convert';

class JwtPayload {
  final int? id;
  final String? name;
  final String? email;
  final String? provider;
  final String? role;

  JwtPayload({this.id, this.name, this.email, this.provider, this.role});

  factory JwtPayload.fromToken(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return JwtPayload();

      final payload = parts[1];
      final normalized = base64Url.normalize(payload);
      final decoded = utf8.decode(base64Url.decode(normalized));
      final map = jsonDecode(decoded) as Map<String, dynamic>;

      return JwtPayload(
        id: (map['id'] as num?)?.toInt(),
        name: map['name'] as String?,
        email: map['email'] as String?,
        provider: map['provider'] as String?,
        role: map['role'] as String?,
      );
    } catch (_) {
      return JwtPayload();
    }
  }
}