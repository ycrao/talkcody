// Authentication routes

import { githubAuth } from '@hono/oauth-providers/github';
import { googleAuth } from '@hono/oauth-providers/google';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { authMiddleware, getAuth } from '../middlewares/auth';
import { authService } from '../services/auth-service';
import type { HonoContext } from '../types/context';

const auth = new Hono<HonoContext>();

// Helper to get OAuth config from environment (works in both Bun and Cloudflare Workers)
function getOAuthConfig(c: Context<HonoContext>) {
  const env = c.env;
  return {
    githubClientId:
      env?.GITHUB_CLIENT_ID || (typeof Bun !== 'undefined' ? Bun.env.GITHUB_CLIENT_ID : '') || '',
    githubClientSecret:
      env?.GITHUB_CLIENT_SECRET ||
      (typeof Bun !== 'undefined' ? Bun.env.GITHUB_CLIENT_SECRET : '') ||
      '',
    googleClientId:
      env?.GOOGLE_CLIENT_ID || (typeof Bun !== 'undefined' ? Bun.env.GOOGLE_CLIENT_ID : '') || '',
    googleClientSecret:
      env?.GOOGLE_CLIENT_SECRET ||
      (typeof Bun !== 'undefined' ? Bun.env.GOOGLE_CLIENT_SECRET : '') ||
      '',
  };
}

/**
 * GitHub OAuth
 */
// Dynamic middleware that gets config from context
auth.use('/github', async (c, next) => {
  const config = getOAuthConfig(c);
  const middleware = githubAuth({
    client_id: config.githubClientId,
    client_secret: config.githubClientSecret,
    scope: ['read:user', 'user:email'],
    oauthApp: true, // Use OAuth App instead of GitHub App (doesn't require email endpoint)
  });
  return middleware(c, next);
});

auth.get('/github', async (c) => {
  const githubUser = c.get('user-github');

  if (!githubUser) {
    return c.json({ error: 'GitHub authentication failed' }, 400);
  }

  try {
    const _config = getOAuthConfig(c);

    console.log('GitHub user data:', {
      id: githubUser.id,
      login: githubUser.login,
      email: githubUser.email,
      name: githubUser.name,
    });

    // Use a fallback email if GitHub email is not available
    const email = githubUser.email || `${githubUser.login}@users.noreply.github.com`;

    // Find or create user
    const user = await authService.findOrCreateUser({
      provider: 'github',
      providerId: githubUser.id?.toString() ?? '',
      email: email,
      name: githubUser.name ?? githubUser.login ?? 'GitHub User',
      avatarUrl: githubUser.avatar_url,
    });

    // Generate JWT token
    const token = await authService.generateToken(user.id, user.email, c.env);

    // Return HTML page that handles deep link redirect
    const deepLink = `talkcody://auth/callback?token=${token}`;
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
          }
          .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          a {
            color: white;
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h1>✓ Authentication Successful!</h1>
          <p>Redirecting to TalkCody...</p>
          <p style="margin-top: 2rem; font-size: 0.9rem;">
            If the app doesn't open automatically,
            <a href="${deepLink}" id="manual-link">click here</a>
            or close this window and return to the app.
          </p>
        </div>
        <script>
          // Automatically redirect to deep link
          setTimeout(() => {
            window.location.href = '${deepLink}';
          }, 1000);

          // Close window after redirect attempt (give user enough time to see the page)
          setTimeout(() => {
            window.close();
          }, 10000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('GitHub auth error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    return c.redirect(`talkcody://auth/error?message=${encodeURIComponent(errorMessage)}`);
  }
});

/**
 * Google OAuth
 */
// Dynamic middleware that gets config from context
auth.use('/google', async (c, next) => {
  const config = getOAuthConfig(c);
  const middleware = googleAuth({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    scope: ['openid', 'email', 'profile'],
  });
  return middleware(c, next);
});

auth.get('/google', async (c) => {
  const googleUser = c.get('user-google');

  if (!googleUser) {
    return c.json({ error: 'Google authentication failed' }, 400);
  }

  try {
    const _config = getOAuthConfig(c);

    // Find or create user
    const user = await authService.findOrCreateUser({
      provider: 'google',
      providerId: googleUser.sub ?? '',
      email: googleUser.email ?? '',
      name: googleUser.name ?? 'Google User',
      avatarUrl: googleUser.picture,
    });

    // Generate JWT token
    const token = await authService.generateToken(user.id, user.email, c.env);

    // Return HTML page that handles deep link redirect
    const deepLink = `talkcody://auth/callback?token=${token}`;
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
          }
          .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          a {
            color: white;
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <h1>✓ Authentication Successful!</h1>
          <p>Redirecting to TalkCody...</p>
          <p style="margin-top: 2rem; font-size: 0.9rem;">
            If the app doesn't open automatically,
            <a href="${deepLink}" id="manual-link">click here</a>
            or close this window and return to the app.
          </p>
        </div>
        <script>
          // Automatically redirect to deep link
          setTimeout(() => {
            window.location.href = '${deepLink}';
          }, 1000);

          // Close window after redirect attempt (give user enough time to see the page)
          setTimeout(() => {
            window.close();
          }, 10000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Google auth error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    return c.redirect(`talkcody://auth/error?message=${encodeURIComponent(errorMessage)}`);
  }
});

/**
 * Get current user (requires authentication)
 */
auth.get('/me', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  const user = await authService.getUserById(userId);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user });
});

/**
 * Logout endpoint (client-side token removal)
 */
auth.post('/logout', authMiddleware, async (c) => {
  // JWT is stateless, so logout is handled client-side by removing the token
  return c.json({ message: 'Logged out successfully' });
});

export default auth;
