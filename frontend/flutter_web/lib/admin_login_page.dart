import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:web/web.dart' as web;

import 'admin_page.dart';
import 'core/constants/app_config.dart';
import 'jwt_decode.dart';

class AdminLoginPage extends StatefulWidget {
  const AdminLoginPage({super.key});

  @override
  State<AdminLoginPage> createState() => _AdminLoginPageState();
}

class _AdminLoginPageState extends State<AdminLoginPage> {
  final TextEditingController _usernameController =
      TextEditingController(text: 'supermao');

  final TextEditingController _passwordController =
      TextEditingController();

  bool _isSubmitting = false;
  bool _hidePassword = true;
  String? _message;
  bool _messageIsError = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _loginAdmin() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;

    if (username.isEmpty) {
      _showMessage(
        'Username is required.',
        isError: true,
      );
      return;
    }

    if (password.isEmpty) {
      _showMessage(
        'Password is required.',
        isError: true,
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
      _message = null;
      _messageIsError = false;
    });

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/auth/admin-login'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: jsonEncode({
          'username': username,
          'password': password,
        }),
      );

      final decodedResponse = jsonDecode(response.body);

      if (response.statusCode != 200) {
        final errorMessage = decodedResponse is Map &&
                decodedResponse['message'] != null
            ? decodedResponse['message'].toString()
            : 'Admin login failed.';

        _showMessage(
          errorMessage,
          isError: true,
        );
        return;
      }

      if (decodedResponse is! Map) {
        _showMessage(
          'The server returned an invalid response.',
          isError: true,
        );
        return;
      }

      final token = decodedResponse['token']?.toString();

      if (token == null || token.isEmpty) {
        _showMessage(
          'Login succeeded, but no authentication token was returned.',
          isError: true,
        );
        return;
      }

      final payload = JwtPayload.fromToken(token);

      if (payload.role != 'admin') {
        _showMessage(
          'This account does not have administrator access.',
          isError: true,
        );
        return;
      }

      web.window.localStorage.setItem('auth_token', token);
      web.window.localStorage.setItem('auth_role', payload.role ?? 'admin');
      web.window.localStorage.setItem('auth_name', payload.name ?? username);

      if (!mounted) {
        return;
      }

      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => const AdminPage(),
        ),
        (route) => false,
      );
    } catch (error) {
      _showMessage(
        'Unable to connect to the backend. Make sure the API is running at $apiBaseUrl.',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  void _showMessage(
    String message, {
    required bool isError,
  }) {
    if (!mounted) {
      return;
    }

    setState(() {
      _message = message;
      _messageIsError = isError;
      _isSubmitting = false;
    });
  }

  void _goBack() {
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
      return;
    }

    web.window.location.hash = '';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFFFBF7),
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          onPressed: _goBack,
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back',
        ),
        title: const Text('Admin Login'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: 440,
              ),
              child: Card(
                color: Colors.white,
                elevation: 2,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: AutofillGroup(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            color: Colors.deepOrange.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Icon(
                            Icons.admin_panel_settings,
                            color: Colors.deepOrange,
                            size: 42,
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'Restaurant Admin',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Sign in to manage stores, products, categories, and restaurant settings.',
                          style: TextStyle(
                            color: Color(0xFF625D5A),
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 28),
                        TextFormField(
                          controller: _usernameController,
                          enabled: !_isSubmitting,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [
                            AutofillHints.username,
                          ],
                          decoration: const InputDecoration(
                            labelText: 'Username',
                            hintText: 'supermao',
                            prefixIcon: Icon(Icons.person_outline),
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _passwordController,
                          enabled: !_isSubmitting,
                          obscureText: _hidePassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [
                            AutofillHints.password,
                          ],
                          onFieldSubmitted: (_) {
                            if (!_isSubmitting) {
                              _loginAdmin();
                            }
                          },
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              onPressed: () {
                                setState(() {
                                  _hidePassword = !_hidePassword;
                                });
                              },
                              icon: Icon(
                                _hidePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                              ),
                              tooltip: _hidePassword
                                  ? 'Show password'
                                  : 'Hide password',
                            ),
                            border: const OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 20),
                        if (_message != null) ...[
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: _messageIsError
                                  ? const Color(0xFFFFEDEA)
                                  : const Color(0xFFE8F6EC),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  _messageIsError
                                      ? Icons.error_outline
                                      : Icons.check_circle_outline,
                                  color: _messageIsError
                                      ? Colors.redAccent
                                      : Colors.green,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    _message!,
                                    style: TextStyle(
                                      color: _messageIsError
                                          ? Colors.redAccent
                                          : Colors.green.shade800,
                                      fontWeight: FontWeight.w600,
                                      height: 1.4,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        SizedBox(
                          height: 52,
                          child: FilledButton.icon(
                            onPressed:
                                _isSubmitting ? null : _loginAdmin,
                            icon: _isSubmitting
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.login),
                            label: Text(
                              _isSubmitting
                                  ? 'Signing in...'
                                  : 'Sign in as Admin',
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                        const Text(
                          'Your account must have role = admin in the users table.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Color(0xFF77716D),
                            fontSize: 12,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
