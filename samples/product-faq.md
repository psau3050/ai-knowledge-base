# Acme Analytics FAQ

## Plans and pricing

The Starter plan is free for up to 3 users and 10,000 events per month. The Team plan costs 49 USD
per user per month and includes unlimited events, SSO and 13 months of data retention. Enterprise
pricing is custom and adds a dedicated support engineer and a 99.95% uptime SLA.

Annual billing gives a 20% discount. Plans can be changed at any time; upgrades take effect
immediately and downgrades at the end of the billing period.

## Data export

Admins can export raw events as CSV or Parquet from Settings → Data → Export. Exports larger than
5 GB are delivered as a link by email and stay available for 7 days. A daily export to your own S3
bucket is available on the Team and Enterprise plans.

## Single sign-on

SSO supports SAML 2.0 and OpenID Connect with Okta, Azure AD and Google Workspace. Once SSO is
enforced, password logins are disabled for everyone except the account owner, who keeps a password
as a break-glass login.

## Data retention and deletion

Events are kept for 90 days on Starter and 13 months on Team. Deleting a project removes its data
within 30 days, including backups. Deletion requests under GDPR are processed within 72 hours.
