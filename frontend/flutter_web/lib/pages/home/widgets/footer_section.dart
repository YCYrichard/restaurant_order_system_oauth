import 'package:flutter/material.dart';

class FooterSection extends StatelessWidget {
  const FooterSection({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: const Color(0xFF1F1A17),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'Orange Bistro',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(height: 10),
              Text(
                'Restaurant ordering system starter with Flutter Web, Node.js backend, MySQL user storage, and social OAuth login.',
                style: TextStyle(
                  color: Color(0xFFD8D0CB),
                  height: 1.6,
                ),
              ),
              SizedBox(height: 16),
              Text(
                'Next build targets: backend product API, cart persistence, and checkout flow.',
                style: TextStyle(
                  color: Color(0xFFFFB38A),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
