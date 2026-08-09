import 'package:go_router/go_router.dart';

import '../../features/admin/admin_page.dart';
import '../../features/auth/admin_login_page.dart';
import '../../models/product.dart';
import '../../pages/checkout_page.dart';
import '../../pages/home_page.dart';
import '../auth/auth_controller.dart';
import 'auth_callback_page.dart';

GoRouter buildAppRouter(AuthController authController) {
  return GoRouter(
    initialLocation: '/',
    // Re-evaluates `redirect` whenever AuthController notifies listeners
    // (login, logout, refresh) - not just on explicit navigation. This is
    // what lets AdminPage's logout, for example, send the user back to
    // /admin/login without an imperative Navigator call.
    refreshListenable: authController,
    redirect: (context, state) {
      final location = state.matchedLocation;

      if (location == '/auth-success' || location == '/auth-error') {
        return null;
      }

      final isAdminArea =
          location.startsWith('/admin') && location != '/admin/login';
      final isAuthenticatedAdmin =
          authController.isLoggedIn && authController.isAdmin;

      if (isAdminArea && !isAuthenticatedAdmin) {
        return '/admin/login';
      }

      if ((location == '/admin/login' || location == '/') &&
          isAuthenticatedAdmin) {
        return '/admin';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const HomePage(),
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;

          return CheckoutPage(
            products: (extra?['products'] as List<Product>?) ?? const [],
            storeId: (extra?['storeId'] as int?) ?? 0,
          );
        },
      ),
      GoRoute(
        path: '/admin/login',
        builder: (context, state) => const AdminLoginPage(),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminPage(),
      ),
      GoRoute(
        path: '/auth-success',
        builder: (context, state) => AuthCallbackPage(
          token: state.uri.queryParameters['token'],
        ),
      ),
      GoRoute(
        path: '/auth-error',
        builder: (context, state) => AuthCallbackPage(
          errorMessage: state.uri.queryParameters['message'] ??
              'Sign-in failed. Please try again.',
        ),
      ),
    ],
  );
}
