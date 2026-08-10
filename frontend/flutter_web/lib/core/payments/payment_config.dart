import '../api/api_client.dart';

/// What checkout needs to know before it can render a payment step: which
/// provider is live, and (for TapPay) the CLIENT key pair its SDK needs.
/// The partner key stays server-side - it is never part of this response.
class PaymentConfig {
  final String provider;
  final String currency;
  final int? appId;
  final String? appKey;
  final String? env;

  const PaymentConfig({
    required this.provider,
    required this.currency,
    this.appId,
    this.appKey,
    this.env,
  });

  bool get isCard => provider == 'tappay';

  factory PaymentConfig.fromJson(Map<String, dynamic> json) {
    return PaymentConfig(
      provider: json['provider']?.toString() ?? 'manual',
      currency: json['currency']?.toString() ?? 'TWD',
      appId: json['appId'] is int ? json['appId'] as int : null,
      appKey: json['appKey']?.toString(),
      env: json['env']?.toString(),
    );
  }

  /// Falls back to manual on any failure - a checkout page that can't reach
  /// the payments endpoint should still let a customer place a pay-at-pickup
  /// order rather than blocking entirely.
  static Future<PaymentConfig> fetch() async {
    try {
      final data = await ApiClient.getJson('/payments/config');
      return PaymentConfig.fromJson(Map<String, dynamic>.from(data));
    } catch (_) {
      return const PaymentConfig(provider: 'manual', currency: 'TWD');
    }
  }
}
