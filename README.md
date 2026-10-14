# RFP Desk — Request & Approval Monitoring

A clean responsive website for submitting RFPs and viewing a protected monitoring dashboard. The app uses the **existing** Google Sheets workbook as its record system, with Google Drive for supporting documents and Gmail for approval emails.

## What is included
- Public request form matching the source spreadsheet's question set.
- Up to 10 supported images/PDFs, maximum **3 MB combined**, enforced both in the browser and on the server. This conservative limit keeps Apps Script/Gmail/Netlify request payloads reliable. To support larger uploads, use authenticated direct-to-storage uploads with a backend.
- Supervisor email with the request summary, inline images for supported formats and file attachments, and a signed 14-day review link.
- Separate approval confirmation page; a simple email link GET cannot silently approve anything.
- Tracking at submission, department decision, finance review, and the historical Approval Log.
- Protected dashboard with approval pie chart, decision duration, finance status counts, search and filters.
- No test credentials embedded in public source.

## Initial Google Sheets structure
The existing workbook ID is configured in 'google-apps-script/Code.gs'. It retains:
- Form Responses 1
- RFP Tracker (26 original columns)
- Approver Master
- Approval Log

The RFP type and department dropdowns follow the existing sample values and reasonable variants. Fields or choices in the Google Form that are not represented in its response sheet could not be inspected directly; compare manually before public rollout.

**Important status semantics:** Supervisor approval moves the tracker to Pending Finance Review. It **does not** mark finance approval or payment completed.

## 1. Configure the Google Apps Script backend
1. Log into the Google account that owns or can edit the monitoring spreadsheet and send the emails.
2. Visit https://script.google.com/ and create a script project.
3. Replace its 'Code.gs' content with 'google-apps-script/Code.gs'.
4. Under Project Settings → Script Properties add:
   - 'RFP_SHARED_SECRET': a cryptographically random string, 32+ bytes (must match Netlify).
   - 'RFP_SITE_URL': the exact published Netlify URL, e.g. 'https://your-site.netlify.app'.
   - 'RFP_SUPERVISOR_EMAIL' (optional): set the private pilot/test recipient address in Script Properties. If omitted, the script uses the active approver email from column C of 'Approver Master'.
5. Deploy → New deployment → Web app. Choose Execute as **Me**, access **Anyone**. The endpoint is publicly reachable, but every POST action requires the secret which is stored only in private Netlify settings.
6. Authorize Sheets, Drive and Gmail scopes and copy the deployment URL ending in '/exec'.
7. The script creates a private folder for uploaded attachments in the executing account's Drive. Files are attached to supervisor emails; Drive links in the tracker remain private unless manually shared.
8. Supervisor emails are resolved from the active department row in 'Approver Master'. For a test recipient, set the optional 'RFP_SUPERVISOR_EMAIL' Script Property. Never hardcode a real email in repository source.

## 2. Configure Netlify and connect GitHub
1. In Netlify choose **Add new project → Import an existing project → GitHub → blimpMac/RFPProject**.
2. Select branch 'main'. Publish directory 'public'. Netlify uses the supplied 'netlify.toml'; no build command is needed.
3. In Site configuration → Environment variables, set all five values shown in '.env.example'. Set 'APPS_SCRIPT_URL' to your deployed script URL and use the exact same 'RFP_SHARED_SECRET' as above.
4. Set 'ADMIN_EMAIL' and a long unique 'ADMIN_PASSWORD' for protected dashboard access. Keep the password private.
5. Deploy, then set 'RFP_SITE_URL' in Apps Script to the actual Netlify domain and **re-deploy the Apps Script version** if necessary.
6. Open '/admin/' and log in. Test '/review/' using the emailed link.
7. Send a small **test** request; verify the new row in the tracker, Form Responses, Approval Log, the supervisor email and the requestor notification. Verify the decision changes the right row and records a date.
8. After this smoke test, make sure appropriate company administrators have access to the script and storage account.

## Security & operational notes
- Protect access to the Apps Script editor and its Script Properties. The Google account should have MFA, and the app should be operated by a dedicated company account.
- Admin sessions use signed, secure, HttpOnly cookies lasting eight hours. Netlify credentials must never appear in website files.
- Review links are bearer credentials and must stay private. They are signed, expire in 14 days, and their action is a server-verified POST. The sheet/script lock blocks second or conflicting decisions.
- A rejected request remains recorded in the tracker and log. Approval does not automatically move the request through finance; finance workflow remains in the original Sheet.
- Use private email attachments for file preview instead of making Drive documents publicly readable. Inline email previews support compatible images; PDF files attach for recipient preview. Drive links may require the storage account's authorization.
- No rate limiting, CAPTCHA, antivirus scanning, granular admin roles or full audit-security review has yet been added. Use additional protections before making the form available to an unrestricted external audience.
- A failed email may be reported as a notification warning after a request/decision is safely written. Retrying submission can create a second request; always check the tracker before submitting again.
- Apps Script and Gmail have provider quotas. The 3 MB limit is intentional, not a Netlify platform maximum.
- Netlify deployment and Google authorization are **not automatic** simply by pushing this repository. Complete steps 1–2 and test the workflow.
- Netlify scans deployed repository files against environment variable values. Keep real admin and supervisor email addresses in Netlify environment variables and Apps Script properties, not in documentation or public source code. Do not disable Netlify secret scanning to bypass this protection.

## Development
'netlify dev' serves the site/functions locally after installing Netlify CLI. Set variables using a local '.env' ignored by Git. No browser-side Google credentials are required.
