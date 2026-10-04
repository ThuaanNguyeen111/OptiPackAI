# Aurelle Developer Console (local sandbox)

Run `npm run dev:aurelle` from the repository root, then open
http://localhost:4000/developer.

Create an application with a name and the exact callback URL of the OptiPack
backend, for example `http://localhost:3003/marketplace/aurelle/callback`.
Copy the generated environment configuration into `be/.env`. Save the secret
before closing the credentials dialog: list responses never include it.

Applications persist in `be/.aurelle-local/apps.json`, which is ignored by Git.
Keep this file private; the local API needs its stored secrets to verify HMAC
signatures. Creation uses cryptographically random keys and secrets. Registered
callbacks must match exactly during authorization.

The application file uses UTF-8. When maintaining it through Windows PowerShell,
always pass `-Encoding UTF8` to `Get-Content`; the default encoding in Windows
PowerShell 5.1 corrupts Vietnamese names when the file is rewritten. The console
reads and writes UTF-8 directly.

This console extends the reference mock API, not a production marketplace.
It binds to loopback only and has no account authentication. Orders, shop tokens,
and authorization codes remain mock data. Production hosting requires account
authentication, secret encryption, real OAuth codes and per-application tokens.

If a secret is lost, create a new application; secret recovery and key rotation
are not implemented in this sandbox.
