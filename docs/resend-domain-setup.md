# Resend email domain setup

The existing Resend API key is valid. Verification was requested for the existing
`eldidamony.com` domain on 2026-10-04. Its status is `pending`; public DNS queries
could not find the required records. No emails were sent.

Add the records below in the DNS provider that manages `eldidamony.com`. The values
come from this account's domain API response; they are public DNS records, not API
credentials. Use the host names below relative to the domain, and disable CNAME
proxying if the DNS provider offers it. Preserve unrelated existing records.

| Type | Host | Value |
| --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0OvZXrEdNOMr/bGD5lGiXxTvdjuErckLoc7LmdKl3Aa9bI75Fc20/zXLRhU1MexRidtYgFTwTJh8rz3aGsB1jyyeoWNH/rcHEh4wPl9kbsdVrn82k2kFOLINCku38ZXNdaFuB+Yv02acinDweFHe62TCQASF5H1WN/SAMBxlu4QIDAQAB` |
| CNAME | `rsend` | `rsend-euw1.forge.rmta.net` |
| CNAME | `send` | `send.forge.rmta.net` |

After the records propagate, recheck the domain in the [Resend domains dashboard](https://resend.com/domains).
Once the status is `verified`, set `RESEND_FROM_EMAIL=appointments@eldidamony.com`
in the private environment file. Keep `RESEND_API_KEY` private.

Resend provides the [domain verification endpoint](https://resend.com/docs/api-reference/domains/verify-domain)
and [domain status/record endpoint](https://resend.com/docs/api-reference/domains/get-domain).
Domain verification alone does not send a test email.
