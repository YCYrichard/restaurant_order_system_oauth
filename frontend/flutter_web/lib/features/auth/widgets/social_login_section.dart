import 'package:flutter/material.dart';

import '../../../core/widgets/section_container.dart';

class SocialLoginSection extends StatelessWidget {
  final bool isLoggedIn;
  final String? token;
  final String? message;
  final VoidCallback onGoogle;
  final VoidCallback onFacebook;
  final VoidCallback onLine;
  final VoidCallback onLogout;

  const SocialLoginSection({
    super.key,
    required this.isLoggedIn,
    required this.token,
    required this.message,
    required this.onGoogle,
    required this.onFacebook,
    required this.onLine,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    return SectionContainer(
      sectionId: 'login-section',
      title: 'Sign in to continue',
      subtitle:
          'Use one of the social providers below to continue into your restaurant ordering account.',
      child: Column(
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: [
              _SocialButton(
                label: 'Continue with Google',
                icon: Icons.g_mobiledata_rounded,
                onPressed: onGoogle,
              ),
              _SocialButton(
                label: 'Continue with Facebook',
                icon: Icons.facebook,
                onPressed: onFacebook,
              ),
              _SocialButton(
                label: 'Continue with LINE',
                icon: Icons.chat_bubble,
                onPressed: onLine,
              ),
            ],
          ),
          const SizedBox(height: 24),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: isLoggedIn
                  ? const Color(0xFFE9F8EE)
                  : const Color(0xFFF5F5F5),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isLoggedIn ? 'Login status: signed in' : 'Login status: guest',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  message ??
                      'After successful login, your token will be detected from the auth-success URL.',
                  style: const TextStyle(
                    color: Color(0xFF5E5A57),
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 14),
                if (token != null && token!.isNotEmpty) ...[
                  const Text(
                    'JWT Token',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  SelectableText(
                    token!,
                    style: const TextStyle(fontSize: 12, height: 1.5),
                  ),
                  const SizedBox(height: 14),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: OutlinedButton.icon(
                      onPressed: onLogout,
                      icon: const Icon(Icons.logout),
                      label: const Text('Logout locally'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onPressed;

  const _SocialButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return FilledButton.tonalIcon(
      onPressed: onPressed,
      icon: Icon(icon),
      label: Text(label),
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      ),
    );
  }
}
