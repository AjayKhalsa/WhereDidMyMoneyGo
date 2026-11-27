# Google OAuth branding

Public pages are part of the existing Vercel app. Their content is static product information; they do not start the private ledger, notification provider or Gmail sync. The signed-in dashboard remains at `/` and retains its authentication gate.

Use these values in **Google Auth Platform → Branding**, for the project that owns the app's existing Google OAuth client:

| Field | Value |
| --- | --- |
| App name | Where Did My Money Go |
| User support email | ajaykhalsa.ak@gmail.com |
| Application home page | https://where-did-my-money-go-chi.vercel.app/about |
| Privacy policy | https://where-did-my-money-go-chi.vercel.app/privacy |
| Terms of service | https://where-did-my-money-go-chi.vercel.app/terms |
| Developer contact email | ajaykhalsa.ak@gmail.com |

The user explicitly chose this public support/privacy address. Select it from Google's support-email dropdown while signed in with an account that can use it. The existing optional logo is `/piggy.png`, a 512×512 PNG under 1 MB. Branding is consistent across the public pages, login and app. Policy links also appear in Settings and the Gmail connection disclosure.

Add the app's hostname to Google's authorised domains if requested and complete Google's ownership checks for that hostname if required. This release does not assert domain ownership or Google's verification approval. Do not claim ownership of the shared `vercel.app` platform domain or change OAuth credentials to work around a validation failure.

The existing **authorised redirect URI stays**:

`https://where-did-my-money-go-chi.vercel.app/api/gmail/callback`

It is not the home-page or privacy-policy URL. Save the completed Branding form, return to **Audience**, and use **Publish app** when Google enables it. Publishing status and any verification requirements are controlled by Google; deploying these pages does not publish the OAuth client. After a successful move out of Testing, reconnect Gmail once in the app to obtain a fresh grant, then Sync now. Existing financial records and import progress are preserved by the reconnect path.

The policy describes actual data handling, including read-only mailbox-wide Gmail permission, app-level import filters, extracted metadata, cloud/browser storage, encrypted server-side refresh credentials, push-provider processing, optional Gemini inputs and free-tier provider processing, retention and deletion requests. It does not promise that Google will approve a public restricted-scope application or that OAuth access can never be revoked. Changes to AI/provider/data-handling behavior require updating the policy and in-product disclosure.

References: [Google OAuth branding requirements](https://support.google.com/cloud/answer/15549049), [Google audience and publishing status](https://support.google.com/cloud/answer/15549945), [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
