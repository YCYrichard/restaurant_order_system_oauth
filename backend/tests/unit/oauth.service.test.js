process.env.JWT_SECRET = 'test_secret';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'root';
process.env.DB_NAME = 'test';
process.env.FRONTEND_URL = 'http://localhost:8080';
process.env.GOOGLE_CLIENT_ID = 'x';
process.env.GOOGLE_CLIENT_SECRET = 'x';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
process.env.FACEBOOK_CLIENT_ID = 'x';
process.env.FACEBOOK_CLIENT_SECRET = 'x';
process.env.FACEBOOK_REDIRECT_URI = 'http://localhost:3000/auth/facebook/callback';
process.env.LINE_CLIENT_ID = 'x';
process.env.LINE_CLIENT_SECRET = 'x';
process.env.LINE_REDIRECT_URI = 'http://localhost:3000/auth/line/callback';

const oauthService = require('../../src/services/oauth.service');

describe('oauth.service OAuth state / next-path handling', () => {
  test('round-trips a safe relative next path through the signed state', () => {
    const url = oauthService.buildGoogleAuthUrl('/store/5/checkout');
    const state = new URL(url).searchParams.get('state');

    const result = oauthService.verifyOAuthState(state, 'google');

    expect(result.next).toBe('/store/5/checkout');
  });

  test('omits next when none was given', () => {
    const url = oauthService.buildGoogleAuthUrl(undefined);
    const state = new URL(url).searchParams.get('state');

    expect(oauthService.verifyOAuthState(state, 'google').next).toBeNull();
  });

  test('drops a next path that is not a safe relative path', () => {
    // A protocol-relative URL ('//evil.com/...') would otherwise let a
    // tampered-but-differently-signed request redirect off-site.
    const url = oauthService.buildGoogleAuthUrl('//evil.com/steal');
    const state = new URL(url).searchParams.get('state');

    expect(oauthService.verifyOAuthState(state, 'google').next).toBeNull();
  });

  test('drops an absolute URL passed as next', () => {
    const url = oauthService.buildGoogleAuthUrl('https://evil.com/steal');
    const state = new URL(url).searchParams.get('state');

    expect(oauthService.verifyOAuthState(state, 'google').next).toBeNull();
  });

  test('rejects state minted for a different provider', () => {
    const url = oauthService.buildGoogleAuthUrl('/store/5');
    const state = new URL(url).searchParams.get('state');

    expect(() => oauthService.verifyOAuthState(state, 'facebook')).toThrow(
      'OAuth state does not match provider'
    );
  });

  test('rejects a missing state parameter', () => {
    expect(() => oauthService.verifyOAuthState(undefined, 'google')).toThrow(
      'Missing OAuth state parameter'
    );
  });

  test('carries next through the facebook and line builders too', () => {
    const fbState = new URL(
      oauthService.buildFacebookAuthUrl('/store/1')
    ).searchParams.get('state');
    const lineState = new URL(
      oauthService.buildLineAuthUrl('/store/1')
    ).searchParams.get('state');

    expect(oauthService.verifyOAuthState(fbState, 'facebook').next).toBe(
      '/store/1'
    );
    expect(oauthService.verifyOAuthState(lineState, 'line').next).toBe(
      '/store/1'
    );
  });
});
