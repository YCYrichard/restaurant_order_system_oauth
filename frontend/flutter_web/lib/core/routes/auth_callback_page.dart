import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';

/// Lands here after the backend's OAuth redirect
/// (`#/auth-success?token=...&next=...` or `#/auth-error?message=...`).
/// Applies the token to AuthController (if present) then returns to wherever
/// the customer was headed before being sent to sign in - the login page
/// passed that path through as `next`, and the backend round-tripped it
/// through the OAuth provider inside the signed state token. Falls back to
/// '/' when there's no next (e.g. sign-in wasn't triggered by a redirect),
/// where the router's own redirect logic takes over (e.g. to /admin for an
/// admin account).
class AuthCallbackPage extends StatefulWidget {
  final String? token;
  final String? next;
  final String? errorMessage;

  const AuthCallbackPage({
    super.key,
    this.token,
    this.next,
    this.errorMessage,
  });

  @override
  State<AuthCallbackPage> createState() => _AuthCallbackPageState();
}

class _AuthCallbackPageState extends State<AuthCallbackPage> {
  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      if (widget.token != null && widget.token!.isNotEmpty) {
        context.read<AuthController>().setSession(widget.token!);
      }

      if (widget.errorMessage == null) {
        final next = widget.next;
        // context.replace, not context.go: the URL we're leaving
        // (#/auth-success?token=<JWT>&next=...) carries the raw access
        // token. go() would push a new history entry on top of it, leaving
        // that token-bearing URL sitting in browser back/forward history
        // indefinitely; replace() overwrites it instead.
        context.replace(next != null && next.isNotEmpty ? next : '/');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.errorMessage != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline,
                  color: Colors.redAccent,
                  size: 48,
                ),
                const SizedBox(height: 16),
                Text(
                  widget.errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 16),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => context.go('/'),
                  child: const Text('Back to Home'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
