import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';

/// Lands here after the backend's OAuth redirect
/// (`#/auth-success?token=...` or `#/auth-error?message=...`). Applies the
/// token to AuthController (if present) then bounces back to '/' - the
/// router's own redirect logic takes it from there (e.g. to /admin for an
/// admin account).
class AuthCallbackPage extends StatefulWidget {
  final String? token;
  final String? errorMessage;

  const AuthCallbackPage({
    super.key,
    this.token,
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
        context.go('/');
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
