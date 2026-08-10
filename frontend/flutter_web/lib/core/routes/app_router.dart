import 'package:go_router/go_router.dart';

import '../../features/admin/admin_page.dart';
import '../../features/auth/admin_login_page.dart';
import '../../features/kitchen/kitchen_page.dart';
import '../../pages/cart_page.dart';
import '../../pages/checkout_page.dart';
import '../../pages/home_page.dart';
import '../../pages/login_page.dart';
import '../../pages/my_orders_page.dart';
import '../../pages/root_redirect_page.dart';
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

      if (location == '/my-orders' && !authController.isLoggedIn) {
        return '/login?next=${Uri.encodeComponent(state.uri.toString())}';
      }

      // An account is required to order - checkout redirects to sign-in
      // and carries the full checkout URL (storeId, table) through so
      // login returns the customer exactly where they left off.
      if (location == '/checkout' && !authController.isLoggedIn) {
        return '/login?next=${Uri.encodeComponent(state.uri.toString())}';
      }

      // Nothing to do on /login once already signed in - bounce onward to
      // wherever the customer was headed (or home if there's nowhere to go).
      if (location == '/login' && authController.isLoggedIn) {
        final next = state.uri.queryParameters['next'];
        return next != null && next.isNotEmpty ? next : '/';
      }

      // Kitchen staff sign in through the same local-login screen as
      // admins; the store scoping is enforced server-side.
      if (location == '/kitchen' && !authController.isLoggedIn) {
        return '/admin/login';
      }

      if (location == '/admin/login' && isAuthenticatedAdmin) {
        return '/admin';
      }

      return null;
    },
    routes: [
      // Not a customer entry point - it resolves to the single active
      // store (if there's exactly one) or explains that ordering happens
      // through a restaurant-provided QR code or link.
      GoRoute(
        path: '/',
        builder: (context, state) => const RootRedirectPage(),
      ),
      // The actual customer entry point, reached via a QR code or a direct
      // link a restaurant hands out - not from any in-app picker.
      GoRoute(
        path: '/store/:storeId',
        builder: (context, state) {
          final storeId = int.tryParse(state.pathParameters['storeId'] ?? '');
          // ?table=N arrives from a scanned table QR code and makes this a
          // dine-in order.
          final tableNumber =
              int.tryParse(state.uri.queryParameters['table'] ?? '');

          return HomePage(
            storeId: storeId,
            tableNumber: tableNumber != null && tableNumber > 0
                ? tableNumber
                : null,
          );
        },
      ),
      GoRoute(
        path: '/store/:storeId/cart',
        builder: (context, state) {
          final storeId = int.tryParse(state.pathParameters['storeId'] ?? '');
          return CartPage(storeId: storeId);
        },
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => LoginPage(
          next: state.uri.queryParameters['next'],
        ),
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) {
          final storeId =
              int.tryParse(state.uri.queryParameters['storeId'] ?? '') ?? 0;
          final tableNumber =
              int.tryParse(state.uri.queryParameters['table'] ?? '');

          return CheckoutPage(
            storeId: storeId,
            tableNumber: tableNumber != null && tableNumber > 0
                ? tableNumber
                : null,
          );
        },
      ),
      GoRoute(
        path: '/my-orders',
        builder: (context, state) => const MyOrdersPage(),
      ),
      // Signed-in only, deliberately not admin-gated: the backend's
      // requireStoreAccess on /orders/store/:storeId is the real
      // enforcement, and gating on isAdmin here would lock out the staff
      // accounts this screen exists for.
      GoRoute(
        path: '/kitchen',
        builder: (context, state) => const KitchenPage(),
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
          next: state.uri.queryParameters['next'],
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
