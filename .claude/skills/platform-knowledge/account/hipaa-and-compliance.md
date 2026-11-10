# HIPAA, security and compliance

## HIPAA accounts

- HIPAA is available on custom plans that include it. If the account's plan doesn't, **Account → Security center → HIPAA** shows "Let's chat about your needs" / **Book a meeting**, so point the user to sales or support.
- **Turning it on** (admins only):
  1. Open **Account → Security center → HIPAA**.
  2. Accept the **Business Associate Agreement (BAA)**.
  3. Switch on **Enable HIPAA compliance**.
- A HIPAA account shows a red **HIPAA Settings** pill in the builder's top bar.
- **If the account stops being HIPAA** (HIPAA switched off or the plan changes), the user must stop adding health information and export or delete what's there within 30 days; after that Blocks may delete what's left.

**What changes for the user:**

- **Third-party integrations aren't covered by the HIPAA agreement.** Connecting one asks for confirmation.
  - Integrations and tools without a BAA show **Blocked for HIPAA**, and runs that need them are stopped.
  - An admin can allow exceptions under **Account → Security center → HIPAA**, and review what was blocked there.
- **Public apps aren't covered.** The **Public** option is shown in red with a warning; keep apps with health information **Private**.
- **Email** that apps send goes through a HIPAA-compliant provider automatically.
- **Not available on HIPAA accounts:**
  - dictation in Ella's chat
  - using your own Claude key
  - some AI code-change tools
- App logins expire sooner.
- **Agent conversations** are shared across all of the app's users by default, as in any account. If users must not see each other's conversations, ask Ella to show each user only their own (`app-capabilities/agents-and-channels.md`); that filters what the list shows and is not a permission.
- Ella works normally.

**What the HIPAA agreement doesn't cover** (full terms on the public **HIPAA Guidelines** page):

- **Support channels** (tickets, chat, email, screen-shares). Tell users not to share health information with support unless a secure channel was agreed in advance.
- **Integrations labeled "HIPAA-ready" or "HIPAA-eligible"** are still outside Blocks' agreement. The user needs their own HIPAA-eligible account and BAA with that provider, and must connect it with that account's credentials.
- Health information that ends up somewhere uncovered: email privacy@blocks.diy. Suspected security incidents involving health information: email security@blocks.diy.

If a HIPAA user asks for something that's refused, explain it's not covered for HIPAA accounts. Don't suggest workarounds that move health data to an uncovered service.

## Security and compliance questions

- **Certifications**: Blocks states it is ISO/IEC 27001 and SOC 2 Type II certified, and GDPR and HIPAA compliant (HIPAA only for accounts with a signed BAA, see above). For reports or details, point to the Trust page or support.
- **GDPR, data residency, DPAs, security questionnaires**: send these to support or sales. **Don't claim the user's app is automatically compliant with any regulation**; compliance also depends on how the app is built and used.
- **Ownership**: the customer owns the apps they build.
- **Security reports**: send to support (support@blocks.diy). There's no public bug-bounty program.
- **Data access by support**: support asks for the user's permission before opening or editing their app.
