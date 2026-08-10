import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:web/web.dart' as web;

import '../core/constants/app_config.dart';

/// A real page for customer sign-in, reached whenever ordering requires an
/// account (checkout, My Orders) and the visitor isn't signed in yet.
///
/// `next` is the in-app path to return to once login completes - it's
/// appended to the OAuth start URL, and the backend carries it through the
/// provider round-trip inside the signed state token (see
/// oauth.service.js) so AuthCallbackPage can send the customer back to
/// exactly where they left off.
class LoginPage extends StatelessWidget {
  final String? next;

  const LoginPage({super.key, this.next});

  void _startOAuth(String provider) {
    final nextParam =
        next != null && next!.isNotEmpty ? '?next=${Uri.encodeComponent(next!)}' : '';
    web.window.location.href = '$apiBaseUrl/auth/$provider$nextParam';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sign In'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          onPressed: () => context.go('/'),
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back',
        ),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Card(
              color: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(28),
              ),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Sign in to order',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'An account keeps your order history in one place and '
                      'lets us tell you when your food is ready.',
                      style: TextStyle(
                        color: Color(0xFF625D5A),
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 28),
                    _ProviderButton(
                      label: 'Continue with Google',
                      icon: Icons.g_mobiledata_rounded,
                      onPressed: () => _startOAuth('google'),
                    ),
                    const SizedBox(height: 12),
                    _ProviderButton(
                      label: 'Continue with Facebook',
                      icon: Icons.facebook,
                      onPressed: () => _startOAuth('facebook'),
                    ),
                    const SizedBox(height: 12),
                    _ProviderButton(
                      label: 'Continue with LINE',
                      icon: Icons.chat_bubble,
                      onPressed: () => _startOAuth('line'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ProviderButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  const _ProviderButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton.tonalIcon(
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(label),
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          alignment: Alignment.centerLeft,
        ),
      ),
    );
  }
}
