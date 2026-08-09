import 'package:go_router/go_router.dart';

import '../../features/admin/admin_page.dart';
import '../../features/auth/admin_login_page.dart';
import '../../features/kitchen/kitchen_page.dart';
import '../../pages/checkout_page.dart';
import '../../pages/home_page.dart';
import '../../pages/my_orders_page.dart';
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

      // There's no standalone customer login page - SocialLoginSection lives
      // inside HomePage - so send signed-out visitors there rather than to a
      // dedicated login route.
      if (location == '/my-orders' && !authController.isLoggedIn) {
        return '/';
      }

      // Kitchen staff sign in through the same local-login screen as
      // admins; the store scoping is enforced server-side.
      if (location == '/kitchen' && !authController.isLoggedIn) {
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
      // Direct link to one store's menu, e.g. /store/1 - shareable, and the
      // entry point QR table ordering builds on.
      GoRoute(
        path: '/store/:storeId',
        builder: (context, state) {
          final storeId = int.tryParse(state.pathParameters['storeId'] ?? '');
          // ?table=N arrives from a scanned table QR code and makes this a
          // dine-in order.
          final tableNumber =
              int.tryParse(state.uri.queryParameters['table'] ?? '');

          return HomePage(
            initialStoreId: storeId,
            tableNumber: tableNumber != null && tableNumber > 0
                ? tableNumber
                : null,
          );
        },
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
