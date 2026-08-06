// ignore_for_file: deprecated_member_use

import 'dart:convert';
import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'jwt_decode.dart';
import 'admin_page.dart';

const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);

class AdminLoginPage extends StatefulWidget {
  const AdminLoginPage({super.key});

  @override
  State<AdminLoginPage> createState() => _AdminLoginPageState();
}

class _AdminLoginPageState extends State<AdminLoginPage> {
  final _usernameController = TextEditingController(text: 'supermao');
  final _passwordController = TextEditingController();

  bool _isSubmitting = false;
  String? _message;
  String? _token;
  JwtPayload? _payload;

  Future<void> _loginAdmin() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text; // not used yet

    if (username.isEmpty) {
      setState(() => _message = 'Username is required.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _message = null;
    });

    final body = {
      'username': username,
      'password': password, // sent for future use
    };

    try {
      final request = await html.HttpRequest.request(
        '$apiBaseUrl/auth/admin-login',
        method: 'POST',
        requestHeaders: {'Content-Type': 'application/json'},
        sendData: jsonEncode(body),
      );

      if (request.status == 200) {
        final data = jsonDecode(request.responseText ?? '{}');
        final token = data['token'] as String?;

        if (token == null || token.isEmpty) {
          setState(() {
            _isSubmitting = false;
            _message = 'Admin login succeeded but no token returned.';
          });
          return;
        }

        final payload = JwtPayload.fromToken(token);

        if (payload.role != 'admin') {
          setState(() {
            _isSubmitting = false;
            _message = 'Login token is not admin. Role: ${payload.role}';
          });
          return;
        }

        setState(() {
          _isSubmitting = false;
          _token = token;
          _payload = payload;
          _message = 'Admin login successful.';
        });

        // Navigate to AdminPage
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) => const AdminPage(),
          ),
        );
      } else {
        setState(() {
          _isSubmitting = false;
          _message = 'Admin login failed: ${request.responseText}';
        });
      }
    } catch (e) {
      setState(() {
        _isSubmitting = false;
        _message = 'Network error: ${e.toString()}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Login'),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Card(
            elevation: 2,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Admin Login',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Sign in with the local admin account to manage stores and products.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  TextFormField(
                    controller: _usernameController,
                    decoration: const InputDecoration(
                      labelText: 'Username',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _passwordController,
                    decoration: const InputDecoration(
                      labelText: 'Password (not enforced yet)',
                      border: OutlineInputBorder(),
                    ),
                    obscureText: true,
                  ),
                  const SizedBox(height: 16),
                  if (_message != null) ...[
                    Text(
                      _message!,
                      style: const TextStyle(
                        color: Colors.deepOrange,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                  ],
                  FilledButton.icon(
                    onPressed: _isSubmitting ? null : _loginAdmin,
                    icon: _isSubmitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.lock_open),
                    label: Text(_isSubmitting ? 'Signing in...' : 'Sign in as Admin'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}