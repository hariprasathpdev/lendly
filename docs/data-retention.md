# Data retention and deletion

This is an operational draft for the campus operator to complete with the college privacy/legal contact before real student data is used. Lendly does not currently run scheduled deletion or anonymization jobs, and no retention periods have been configured.

## Retention approach

Keep each category only while it is needed for the service, support, safety review, or a documented legal or financial obligation. The operator must set and record a specific period for each category before launch. Do not invent a single retention period for all records.

| Data category | Current purpose | Retention decision needed |
| --- | --- | --- |
| Profile and verified college email | Campus access, account recovery, and participant labels | Keep while the account is active; define the deletion or anonymization period after account closure, including any open booking or safety hold. |
| Listings and listing photos | Marketplace discovery and listing history | Remove photos when no active listing, booking, dispute, or other documented hold requires them; define cleanup for archived listings. |
| Bookings and status history | Handover, return, dispute, and payment context | Define a period with the college for completed and cancelled bookings; preserve records needed to resolve open matters. |
| Payments, deposits, refunds, and fee calculations | Payment status, refund traceability, and fee review | Set the period with the responsible finance and privacy contacts; do not store card details. |
| Messages, reports, disputes, and reviews | Coordination, abuse reporting, and resolution | Define category-specific periods and access restrictions; avoid retaining message content longer than the documented need. |
| Audit and security events | Accountability and investigation | Define a review and expiry period; restrict access to campus administrators who need it. Security events currently contain fixed event codes and account references, not IP addresses or tokens. |
| Provider backups and authentication logs | Disaster recovery and account security | Confirm provider retention and backup expiry settings for the selected service plan. Application deletion does not necessarily remove provider backups immediately. |

## Account closure and deletion requests

1. Route requests to the published campus privacy/support contact. Verify the requester through the approved account process; never ask for passwords or authentication tokens.
2. Check for open bookings, disputes, payment/refund records, or documented holds before deleting or anonymizing related information.
3. Apply the approved category-specific retention rules across the application database, private photo storage, Auth provider, monitoring tools, and exports.
4. Preserve only records covered by a documented hold or obligation. Restrict those records to the staff who need them.
5. Record the request, decision, systems checked, and completion date in the operator's restricted process log.
6. Confirm completion through the published support route. Follow the approved policy for data in backups when those backups expire.

## Launch checklist

- Name the college privacy contact and the operator who handles requests.
- Fill in a specific period and deletion owner for every row in the table.
- Document the legal or business reason for any exception or hold.
- Implement and test scheduled cleanup only after the approved periods and preservation rules are known.
- Test one account-closure request and confirm that required booking and financial records remain coherent.
