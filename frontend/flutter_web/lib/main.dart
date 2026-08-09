import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/auth/auth_controller.dart';
import 'core/routes/app_router.dart';
import 'features/cart/cart_controller.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  late final AuthController _authController;
  late final CartController _cartController;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _authController = AuthController();
    _cartController = CartController();
    // Built once with a stable AuthController reference - refreshListenable
    // subscribes to it directly, so rebuilding the router on every auth
    // change (e.g. via context.watch) would wipe the navigation stack.
    _router = buildAppRouter(_authController);
  }

  @override
  void dispose() {
    _authController.dispose();
    _cartController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _authController),
        ChangeNotifierProvider.value(value: _cartController),
      ],
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        title: 'Restaurant Ordering System',
        theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: Colors.deepOrange,
          scaffoldBackgroundColor: const Color(0xFFFFFBF7),
        ),
        routerConfig: _router,
      ),
    );
  }
}
