import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

import '../../admin_page.dart';
import '../../jwt_decode.dart';
import '../../pages/home_page.dart';

class RoleRouterPage extends StatefulWidget {
  const RoleRouterPage({super.key});

  @override
  State<RoleRouterPage> createState() => _RoleRouterPageState();
}

class _RoleRouterPageState extends State<RoleRouterPage> {
  bool _loading = true;
  String? _token;
  JwtPayload? _payload;

  @override
  void initState() {
    super.initState();
    _loadStoredAuthentication();
  }

  void _loadStoredAuthentication() {
    final storedToken = web.window.localStorage.getItem('auth_token');

    if (storedToken == null || storedToken.isEmpty) {
      setState(() {
        _loading = false;
      });
      return;
    }

    final payload = JwtPayload.fromToken(storedToken);

    setState(() {
      _token = storedToken;
      _payload = payload;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (_token != null && _payload != null && _payload!.role == 'admin') {
      return const AdminPage();
    }

    return const HomePage();
  }
}
