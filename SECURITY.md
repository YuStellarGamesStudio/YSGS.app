# Security Policy

**Project:** 星語遊戲網  
**Domain:** ysgs.app  
**Repository:** https://github.com/YuStellarGamesStudio/YSGS.app  
**Policy status:** Initial policy; subject to ongoing review  
**Last updated:** 2026-10-01

## 1. Purpose and Interpretation

This document describes how security concerns should be reported, investigated, remediated, verified, and disclosed for this project. It also defines expectations for security reviews and authorized vulnerability scanning as the website evolves.

A policy describes required practices; it is not evidence that every control has been implemented. Statements about completed scans, deployed protections, supported releases, or resolved vulnerabilities require separate verification. The existence of this document does not certify the website as secure.

Within this document:

- **Must** describes a required security boundary or handling rule.
- **Should** describes an expected practice; a deviation needs a documented reason.
- **May** describes an optional practice appropriate to the circumstances.

Requirements apply when the relevant feature or infrastructure exists. Sections covering accounts, APIs, databases, uploads, or automated deployments do not imply that these capabilities are currently implemented.

## 2. Current Baseline and Unverified Items

The repository contains a Vite website written in native TypeScript, strict TypeScript configuration, an npm lockfile, and GitHub Actions definitions for CI and Pages deployment. The initial homepage does not implement accounts, backend endpoints, uploads, or user data storage. Domain and publishing-related marker files (`CNAME` and `.nojekyll`) are copied from the repository root into the `dist` build output.

The `CNAME` file records `ysgs.app`. This does not establish ownership of every associated service, prove that the site is deployed, or authorize scanning. The presence of `.nojekyll` does not prove the active hosting configuration.

The following remain unverified:

- The live site's hosting configuration, whether the committed GitHub Actions workflows have been enabled or executed successfully, and the deployed revision.
- DNS records, domain renewal controls, and certificate status.
- HTTP response headers and redirects beyond the spot checks recorded in section 6.4, caching behavior, and third-party resources.
- Whether GitHub private vulnerability reporting is enabled for this repository.
- Repository access controls, branch protections, deployment environment protections, and any security tooling beyond the committed workflow definitions.

Local verification on 2026-10-01 completed `npm ci` and `npm run check` using Node.js 24.21.0. Type checking and production building passed, and npm audit reported zero known dependency vulnerabilities at that time. Actionlint 1.7.12 accepted both workflow definitions. The built homepage was exercised in local Chromium at desktop and mobile viewport sizes, including its TypeScript behavior and published marker files.

These checks do not establish the absence of vulnerabilities or prove a successful GitHub Pages deployment. No live website security scan or penetration test was performed. Registry advisory coverage and the local environment limit the conclusions that can be drawn; re-evaluate the baseline as the website changes.

## 3. Scope and Supported Versions

### 3.1 In-scope project components

Security maintenance applies to components controlled by this project, including, when present:

- Website source code, templates, styles, scripts, and static assets.
- Client-side handling of URLs, browser storage, and untrusted content.
- Dependencies, lockfiles, build tools, and asset generation.
- Repository-managed hosting, deployment, and automation configuration.
- Server-side endpoints, authentication, authorization, and data handling.
- Integrations and third-party resources as used by the website.

A concern involving a third-party product may require reporting to its vendor. Project maintainers can still assess whether the website's integration exposes users to risk.

### 3.2 Supported code

Security fixes currently target the latest code on the `main` branch. There are no documented versioned-release support periods or backport commitments.

A deployed site may differ from `main`. Reports should identify the observed URL and time, and, if known, the affected commit or release. A source fix is not proof that the live site has been updated.

When versioned releases are introduced, document supported versions, end-of-support dates, and any backport policy here. Do not imply support for historical releases without an explicit commitment.

### 3.3 Authorization is separate from scope

Being relevant to this project does not make a system an authorized test target. Third-party hosting infrastructure, GitHub services, analytics providers, payment services, and unrelated domains are not authorized for active testing by this policy.

## 4. Reporting a Vulnerability

### 4.1 Use a private channel

Do not publish exploitable details, secrets, personal data, or exploit payloads in public issues, pull requests, discussions, or commit messages before coordinated disclosure.

Preferred reporting path:

1. Open this repository's GitHub **Security** page.
2. If **Report a vulnerability** is available, use it to submit a private report.
3. If it is unavailable, contact a maintainer through a contact method the maintainer has publicly provided and request a private reporting channel before sending sensitive details.

Private reporting availability has not been confirmed. This policy does not publish a dedicated security email address or assert that a monitored security inbox exists. Do not guess an address or assume an ordinary public issue is confidential.

If no private contact method is available, a public request to establish one may be appropriate, but it must contain no affected endpoint, reproduction steps, exploit details, secret, or personal data.

### 4.2 What to include

Provide enough information for a maintainer to understand and safely reproduce the issue:

- A concise title and description of the security boundary violated.
- Affected URLs, components, files, versions, or commits, if known.
- When the behavior was observed, including the time zone if relevant.
- Preconditions, such as an account role, browser state, or configuration.
- Minimal reproduction steps using synthetic data and accounts you control.
- Expected behavior and the observed result.
- Potential confidentiality, integrity, or availability impact.
- Whether the issue appears reproducible and what remains uncertain.
- Redacted screenshots, response excerpts, or other minimal evidence.
- Any proposed fix or mitigation, if available.
- Whether any disclosure has already occurred and where.

A severity assessment is welcome but not required. Reports without a working exploit may still be useful if the underlying behavior and impact are supported by evidence.

### 4.3 Evidence handling

Do not include active credentials, session cookies, private keys, unredacted personal information, or copies of other users' data. Prefer synthetic examples and the minimum evidence needed to establish the issue.

If a secret is already exposed, report its location and type without reproducing the full value. Treat a publicly exposed secret as potentially compromised even if it has been removed from the latest file.

Do not upload confidential evidence to public paste sites or publicly accessible file shares. Use the agreed private channel and follow any evidence-handling instructions from the maintainers.

### 4.4 Response expectations

Maintainers should acknowledge reports, assess impact, ask for missing information, and communicate material status changes through the private reporting channel when one is available.

No guaranteed acknowledgment time, remediation deadline, or service-level agreement has been established. Remediation priority depends on confirmed impact, exposure, exploitation evidence, and available mitigations.

No bug bounty, payment commitment, or legal safe-harbor program is established by this document. Coordinate any public disclosure timing explicitly; do not assume a fixed deadline or implied permission.

## 5. Authorized Testing and Vulnerability Scanning

### 5.1 Default boundary

Default security work is limited to local source review, local dependency and configuration analysis, and local test environments. Use synthetic data and test accounts under your control.

Local tools may still transmit source code, package metadata, URLs, or telemetry to external services. Check their behavior before use. Do not upload proprietary code, secrets, or sensitive artifacts without authorization.

### 5.2 Active testing of external targets

Before active testing of `ysgs.app` or any external service, obtain explicit authorization from someone entitled to grant it. Record:

- Exact authorized hosts, URLs, endpoints, and environments.
- Whether subdomains are included; do not assume wildcard scope.
- Permitted techniques and specifically prohibited techniques.
- Testing dates, request rates, concurrency, and resource limits.
- Approved accounts and data, if authentication is involved.
- A contact and stop procedure for unexpected impact.
- Relevant hosting-provider and third-party restrictions.
- How evidence will be stored, shared, and removed.

Domain ownership, repository access, or a general request to focus on security is not blanket authorization for penetration testing, production writes, or third-party scanning.

### 5.3 Prohibited behavior without separate explicit approval

Do not perform:

- Denial-of-service, stress, resource-exhaustion, or destructive testing.
- Password spraying, credential stuffing, brute-force authentication, or use of stolen credentials.
- Unauthorized data access, bulk extraction, or modification of real user data.
- Persistence, malware deployment, lateral movement, or privilege abuse.
- Social engineering, phishing, or physical intrusion.
- Security-control bypasses solely to make a scanner complete.
- Testing beyond the authorized target, account, technique, or time window.

Even with authorization from project maintainers, third-party systems require permission from their respective owners where applicable.

### 5.4 Stop conditions

Stop the relevant test if it causes unexpected errors, service degradation, sensitive-data exposure, or access beyond the agreed scope. Do not continue probing to measure how much data is accessible.

Preserve only the minimum redacted evidence, record what occurred, and notify the authorized contact privately. Do not delete or alter system evidence to conceal the test.

## 6. Security Review Priorities

### 6.1 Untrusted input and browser execution

- Treat URL parameters, fragments, externally supplied content, browser storage, and third-party messages as untrusted.
- Prefer text rendering over HTML insertion when markup is not needed. Apply context-appropriate encoding; HTML, attributes, URLs, CSS, and JavaScript have different requirements.
- When rendering untrusted HTML is necessary, use a maintained sanitizer suitable for the allowed markup. Do not rely on ad hoc string replacement.
- Review unsafe DOM sinks, dynamic script execution, and user-controlled link destinations.
- Validate allowed URL schemes and destinations where a feature accepts URLs.
- For cross-window messaging, validate both the sender's origin and message structure, and use an explicit target origin for sensitive messages.
- Check redirects for user-controlled destinations. Do not assume a same-looking URL is same-origin.

### 6.2 Authentication, authorization, and sessions

If accounts or protected endpoints are added:

- Enforce authorization on the server for each protected operation and object. Hidden UI controls and client-side checks are not access control.
- Separate unauthenticated, authenticated, and privileged operations explicitly.
- Verify object ownership and role boundaries with accounts representing different permissions.
- Use appropriate session expiration, invalidation, and protection against session fixation.
- Apply suitable cookie controls, including `Secure`, `HttpOnly`, and an appropriate `SameSite` setting where cookie-based sessions are used.
- Protect state-changing operations against CSRF when credentials are attached automatically by the browser. CORS alone is not a CSRF defense.
- Do not embed privileged API credentials or authorization decisions in downloadable frontend code.

### 6.3 Server-side processing and storage

If backend services are added:

- Use parameterized queries and avoid constructing SQL, shell commands, or interpreter input from untrusted strings.
- Validate types, permitted values, lengths, and sizes at trust boundaries.
- Review path handling, archive extraction, file uploads, and filename generation for traversal and overwrite risks.
- Treat server-side URL fetching as an SSRF-sensitive feature; review destination restrictions, redirects, DNS resolution, and access to internal services.
- Avoid unsafe deserialization and restrict executable or interpreted content.
- Limit upload sizes and types based on actual content and business needs. Do not execute uploaded content.
- Return useful errors without exposing stack traces, internal paths, credentials, or private configuration.

### 6.4 HTTPS, headers, and cross-origin controls

For the actual hosting environment:

- Verify HTTPS delivery, redirect behavior, certificate validity, and mixed-content risks.
- Evaluate a Content Security Policy appropriate to the site's required resource origins. A policy must be tested against real browser behavior; a header's presence alone does not prove protection.
- Evaluate framing protection, content-type handling such as `X-Content-Type-Options`, referrer policy, and browser capability restrictions where appropriate.
- Consider HSTS only after HTTPS behavior and relevant subdomain requirements are understood. `includeSubDomains` and preload have broader consequences and must not be enabled casually.
- Restrict CORS to the origins and methods required by the application. Do not reflect arbitrary origins when credentials or private data are involved.
- Check caching rules for authenticated or sensitive responses if such responses are introduced.

Verify which headers the hosting platform can actually set. HTML metadata does not replace transport-level controls; for example, HSTS requires an HTTP response header. Do not claim that adding a source file has configured a control unless the deployment platform consumes it and the delivered response confirms it.

The game player uses a sandbox permitting only scripts, same-origin storage for cross-origin games, and pointer lock. Same-origin launch URLs do not receive `allow-same-origin`, so embedded scripts cannot remove their sandbox through parent DOM access. Top-level navigation, popups, form submission, and downloads are not granted. Local headless Chromium verification confirmed that a cross-origin fixture executed scripts and used localStorage while a clicked top-level navigation did not replace the host page. This does not verify compatibility with every published game.

The README documents a Cloudflare response-header rule scoped to `ysgs.app` for `Content-Security-Policy: frame-ancestors 'none';` and `X-Frame-Options: DENY`. GitHub Pages does not consume a repository `_headers` file for this purpose. On 2026-10-02, responses from `https://ysgs.app/` and `https://ysgs.app/?play=airhive` included both headers, and headless Chromium refused to render `https://ysgs.app/` inside an iframe on `https://example.com/`. This verifies only those URLs at that time; rule changes in Cloudflare can change the result.

On the same date, `https://ysgs.app/`, `https://www.ysgs.app/`, `https://data.ysgs.app/`, and `https://airhive.ysgs.app/` returned `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, and `http://ysgs.app/` and `http://www.ysgs.app/` redirected to HTTPS on the same host. Because `includeSubDomains` covers every subdomain, any new subdomain must serve valid HTTPS before use. The hstspreload.org API reported no preload eligibility errors or warnings for `ysgs.app` and listed its status as `preloaded` through the `.app` top-level domain entry, so browsers with that list already require HTTPS for the domain independently of this header.

### 6.5 Third-party content and privacy

- Inventory external scripts, styles, fonts, embeds, analytics, and browser-side API integrations.
- Consider whether a third-party compromise could execute code in the site's origin or expose visitor data.
- Prefer trusted, stable resources and review version changes. Use Subresource Integrity when applicable to fixed external assets and supported delivery conditions.
- Minimize personal data collection and avoid putting sensitive values in URLs, client logs, analytics events, or publicly readable storage.
- If data collection is introduced, document access, retention, deletion, and relevant disclosures. Do not invent legal compliance claims.
- Do not assume browser storage is safe for secrets; code running in the same origin may be able to access it.

## 7. Dependencies and Supply-Chain Security

When dependencies or build tooling are introduced:

- Review whether a dependency is necessary before adding it.
- Prefer maintained packages and verify package identity, provenance, licensing, and compatibility.
- Use lockfiles where supported and review unexpected dependency or lockfile changes.
- Treat installation scripts, build plugins, and downloaded executables as code execution risks.
- Assess advisories against the actual installed version, affected feature, and deployment path.
- Distinguish a package advisory from a verified exploitable condition in this website. A build-only vulnerability may still matter if untrusted input reaches the build environment.
- Validate security updates through relevant behavior checks rather than relying only on an audit count.
- Document exceptions with a reason, compensating controls, an owner, and a review condition. Avoid indefinite blanket suppression.

The committed CI workflow runs `npm audit --audit-level=high` against the locked dependency tree, including development dependencies. High or critical advisories, audit service failures, type-check failures, and build failures block that workflow and its dependent Pages deployment. Lower-severity advisories do not fail this audit threshold and still require assessment. npm audit relies on registry advisory data and does not replace source review or establish website exploitability. No scheduled audit, software bill of materials, or automated dependency update service is configured in this repository.

## 8. Repository, CI/CD, Hosting, and Domain Security

### 8.1 Access and secrets

- Limit repository and deployment permissions to the access required by each role.
- Use strong account protection, including multi-factor authentication where available.
- Review collaborator, service-account, and integration access when responsibilities change.
- Never commit credentials, private keys, or production secrets. Environment files and generated assets must be reviewed for accidental disclosure.
- Remember that frontend bundles, source maps, static files, and build-time values included in them are downloadable, regardless of the original variable name.
- If a credential is exposed, revoke or rotate it promptly and assess access. Removing it from the current file or rewriting history does not make it trustworthy again.

### 8.2 Automated workflows

The committed workflows use the following build and deployment model:

- `.github/workflows/ci.yml` runs on pull requests targeting `main`, manual dispatch, and reusable workflow calls. It uses Node.js 24, `npm ci`, strict TypeScript checking, dependency auditing, and a Vite production build.
- `.github/workflows/pages.yml` runs on pushes to `main`, manual dispatch, or a five-minute schedule (`*/5 * * * *`) that keeps the sitemap in step with the GameCatalog. GitHub may delay or skip scheduled runs. Its jobs are gated to `main`, and it calls the same CI workflow to produce the Pages artifact rather than rebuilding after validation.
- Only the deployment job receives `pages: write` and `id-token: write`; the build uses `contents: read`. Checkout does not persist repository credentials. No custom deployment secret is required by these workflow definitions.
- The deployment depends on successful CI and publishes only `dist`, including the existing domain marker files, through GitHub's official Pages artifact and deployment actions.
- Actions are pinned to resolved commit SHAs. The deployment targets the `github-pages` environment, with concurrency configured not to interrupt an active Pages run.
- No `pull_request_target` workflow or privileged pull-request deployment is defined.

These are source-level configuration facts, not proof of a successful GitHub-hosted run. Repository owners must select **GitHub Actions** as the Pages publishing source and verify the custom domain, HTTPS, environment rules, and branch protections separately.

When changing automation:

- Grant workflow tokens and deployment credentials the minimum required permissions.
- Keep secrets and privileged execution unavailable to untrusted pull-request code.
- Review workflow event semantics before running code from forks or external contributions.
- Pin third-party automation to reviewed immutable revisions where practical and maintain those pins deliberately.
- Prevent untrusted input from being interpolated directly into shell commands.
- Review built artifacts before publication and retain a traceable relationship between source revision and deployment.
- Evaluate protected branches, required reviews, and protected deployment environments according to project needs.

These are maintenance expectations, not assertions about current GitHub settings.

### 8.3 Domain and hosting lifecycle

- Verify domain ownership and hosting association using the provider's supported process.
- Review DNS records and remove obsolete records through an authorized change process to reduce takeover risk.
- Track domain renewal responsibility and changes to registrar or DNS access.
- Check that publishing does not expose private files, backups, secrets, or unintended artifacts.
- When retiring a site or service, coordinate DNS and hosting removal so references do not point to an unclaimed resource.
- Do not modify production DNS, hosting, certificates, or deployment permissions without explicit authority.

## 9. Reviewing and Recording Security Findings

### 9.1 Evidence categories

Use explicit status labels:

| Status | Meaning |
| --- | --- |
| Confirmed vulnerability | Evidence establishes a security-boundary violation under documented conditions. |
| Potential risk | A plausible concern needs additional evidence or reproduction. |
| Informational observation | A fact or hardening opportunity without established vulnerability impact. |
| Not reproducible | The attempted reproduction did not establish the reported behavior; record limitations. |
| Remediated in source | The relevant code or configuration has changed; runtime or deployment verification may remain. |
| Verified remediated | Relevant reproduction and affected behavior were checked in the stated environment. |

A scanner result alone does not establish exploitability. Failure to reproduce once does not prove absence. Do not convert an unknown configuration into a confirmed vulnerability.

### 9.2 Minimum finding record

For each meaningful finding, record privately when necessary:

- Identifier or concise title.
- Evidence category and current investigation status.
- Affected component, revision, and environment.
- Preconditions and the trust boundary involved.
- Reproduction evidence and limitations.
- Confidentiality, integrity, and availability impact.
- Severity, rationale, and any scoring assumptions.
- Proposed remediation or mitigation.
- Responsible maintainer and progress, when assigned.
- Verification outcome and deployment status.
- Disclosure restrictions and agreed next steps.

Public documentation must not contain active secrets, personal data, or premature exploitation details. An audit report should be a separate, appropriately protected record; this policy should not become an exploit catalog.

### 9.3 Severity and prioritization

Assess impact and exploitability together, including required privileges, user interaction, exposure, affected users, and whether exploitation has been observed.

| Severity | General guidance |
| --- | --- |
| Critical | Severe compromise with broad impact and few practical barriers, such as reachable code execution or privileged credential compromise. |
| High | Substantial unauthorized access, data exposure, or control over important operations under realistic conditions. |
| Medium | Meaningful but constrained impact, additional prerequisites, or narrower exposure. |
| Low | Limited impact or a narrowly exploitable weakness. |
| Informational | No established security-boundary violation; an observation or hardening recommendation. |

These are guidelines, not automatic mappings. A missing header does not alone establish a high-severity vulnerability. If CVSS is used, record its version, vector, and assumptions; do not invent a score from a tool label.

Active exploitation, exposed credentials, and immediate user harm may require urgent containment regardless of the initial severity label. This policy does not set fixed remediation deadlines.

## 10. Remediation and Verification

### 10.1 Remediation approach

- Investigate the root cause and affected paths before modifying code.
- Apply the smallest complete fix that restores the intended security boundary.
- Review related callers, configurations, and equivalent paths for the same root cause without introducing unrelated redesigns.
- Preserve existing user changes and avoid unrelated refactoring.
- Do not suppress exceptions, disable authentication, broaden permissions, or remove validation simply to make a test pass.
- Label temporary mitigations honestly; they are not automatically equivalent to a complete fix.
- Coordinate sensitive patches and publication so the public change does not expose an unresolved issue prematurely.

### 10.2 Verification evidence

Verification should demonstrate the affected behavior, not merely that code compiles or a scanner's warning disappeared:

1. Establish the reported behavior safely in an authorized environment, or identify why reproduction is not possible.
2. Apply the fix and rerun the relevant scenario under comparable conditions.
3. Check legitimate behavior and meaningful boundaries, including alternate roles or inputs when relevant.
4. Use targeted automated regression coverage for reproducible consumer-visible security failures where practical.
5. Exercise the real runtime surface: the browser for browser behavior, an endpoint for API behavior, or a build/deployment path for configuration behavior.
6. Record the environment, revision, commands or method used, observed result, and remaining limitations.

A mock, source-text assertion, successful build, or absence of exceptions is not by itself proof of a security fix. Do not claim tests passed unless they were actually executed successfully.

### 10.3 Deployment confirmation

Keep source remediation separate from deployed remediation. When deployment is authorized, confirm the affected environment uses the intended revision and verify the relevant externally observable behavior within the approved scope.

If production access, deployment evidence, or safe verification is unavailable, state that limitation rather than marking the live issue resolved. A rollback must consider whether it would reintroduce the vulnerability.

## 11. Security Incident Handling

An incident may involve active exploitation, exposed credentials, unauthorized publication, compromised dependencies, domain takeover, or unexpected access to user information.

The maintainer handling the incident should:

1. **Assess:** Determine the affected assets, timeline, current exposure, and immediate user risk. Separate confirmed facts from hypotheses.
2. **Coordinate:** Establish an authorized private communication channel and identify who can make repository, hosting, or credential changes.
3. **Contain:** Choose proportionate measures, such as revoking compromised credentials or pausing an affected function. Production-impacting changes require appropriate authority.
4. **Preserve evidence:** Retain relevant logs and timestamps with restricted access. Avoid recording additional secrets or personal data unnecessarily.
5. **Remediate:** Address the root cause, review related exposure, and validate the repair.
6. **Recover:** Restore functionality carefully and confirm the intended deployment state.
7. **Communicate:** Provide accurate information to affected parties through appropriate channels. Assess notification obligations with qualified advice when needed; this policy does not assert jurisdiction-specific legal conclusions.
8. **Review:** Record lessons, remaining risk, and necessary changes to this policy or operational controls.

Do not destroy evidence, silently hide the incident, or publish sensitive data as proof. Evidence retention and deletion should follow the incident's actual needs and any applicable obligations, rather than an invented fixed period.

## 12. Coordinated Disclosure

Maintain private coordination while assessing and fixing a nonpublic vulnerability. Agree on what may be disclosed and when, considering deployment status, affected users, third-party coordination, and the risk of immediate exploitation.

A public advisory, when appropriate, should contain:

- A clear summary and affected components or versions.
- The impact and necessary prerequisites, without unnecessary harmful detail.
- Fixed versions or commits and the actual deployment status, if verified.
- User actions, mitigations, and known limitations.
- Researcher credit only with the reporter's consent.

No automatic disclosure deadline is established here. Public availability of a patch does not by itself prove that affected deployments are protected. If an issue is already public, continue using accurate, minimized communication and prioritize risk reduction.

## 13. Keeping This Policy Current

### 13.1 Update triggers

Review this document when any of the following changes:

- Website features or trust boundaries, especially accounts, APIs, uploads, payments, or stored user data.
- Dependencies, build tooling, third-party resources, or integrations.
- Hosting, DNS, HTTPS, deployment workflows, or repository permissions.
- Supported versions, maintenance ownership, or reporting channels.
- Security tooling, approved scanning procedures, or incident-handling practices.
- A security fix or incident reveals that existing guidance is incomplete or inaccurate.

### 13.2 Maintenance rules

- Keep `SECURITY.md` in English and update **Last updated** when its contents materially change.
- Review relevant sections alongside the code or configuration change, rather than postponing known policy changes.
- If no update is needed, retain the existing policy; do not change the date merely to imply a review or scan occurred.
- Replace obsolete guidance and verify reporting links or contact methods before declaring them active.
- Keep requirements, implemented controls, and observed verification results clearly separated.
- Record only disclosure-safe security summaries in public documentation.
- Use `AGENTS.md` for persistent project instructions and `CLAUDE.md` for its existing instruction reference; keep their security guidance consistent with this policy.

### 13.3 Future operational decisions

The following should be established when the project has the required ownership and implementation context:

- A verified private reporting channel and responsible maintainers.
- Supported release versions and end-of-support rules, if releases are introduced.
- An inventory of deployed components and third-party services.
- A documented authorized scanning scope and safe execution process.
- Appropriate review and automation controls for the actual build and deployment model.

These items are not promises that tooling or infrastructure already exists. Until verified, report them as pending operational decisions and do not fabricate owners, deadlines, or scan results.
