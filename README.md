# QuickBooks Online → Google Sheets AR Collections Tracker

A Google Apps Script that connects a Google Sheet to QuickBooks Online and turns it into a weekly accounts-receivable collections dashboard. It uses no external libraries: OAuth 2.0 and the QBO REST API are called directly with `UrlFetchApp`.

## What it does

Everything runs from a **QuickBooks Integration** menu in the sheet:

| Step | Menu item | What happens |
|---|---|---|
| — | Authorize App | Runs the OAuth 2.0 flow with Intuit (CSRF-protected `state`, auto-refreshing tokens) |
| 1 | Pull Invoices from QBO | Pulls every open Invoice and Credit Memo (paginated) into an **Invoices** tab, grouped by customer with a grand total |
| 2 | Load New Invoices to Weekly Report | Copies invoices due in the next 14 days, plus past-due ones, into the **CEO View**. Adds a status dropdown and looks up each customer's risk rating and recommended terms |
| 3 | Sync Paid Dates from QBO | Marks invoices that QBO shows fully paid as **Paid** and records the actual payment date from the linked Payment |
| 4 | Archive Paid Invoices | Moves confirmed-paid rows into the **Master AR Log**. It won't archive anything QBO still shows as open, and it won't log the same invoice twice |
| — | Accident-Proofing | Rebuilds the KPI tiles at the top of the CEO View: Expected This Week, Confirmed, At Risk, Last Week Promised, Collected Last Week, Variance |
| — | Audit Master AR Log | Highlights duplicate rows, and rows logged as paid that QBO still shows open. Deletes nothing |

## Sheet layout

The script expects these tabs:

- **Invoices**: written by step 1.
- **Weekly AR Collections (CEO VIEW)**: KPI tiles in rows 1–6, then a table titled `UPCOMING & OPEN INVOICES` with columns  
  `Invoice | Customer | Amount | Due Date | Expected Pay Date | Status | Last Contact | Next Touchpoint | Risk Rating | Risk Note | Recommended Terms | Actual Paid Date`
- **Master AR Log**: history of paid invoices (`Invoice … Actual Paid Date` in A–K; your own formulas such as *On Time?* or *Days Variance* can go in L onward).
- **Customer Payment Reliability Scorecard**: one row per customer. Column G is the risk rating (🟢 / 🟡 / 🔴) and column H is the recommended terms.

## Setup

1. **Create an Intuit app** at <https://developer.intuit.com> with the `com.intuit.quickbooks.accounting` scope.
2. In your Google Sheet, open **Extensions → Apps Script** and paste in `src/Code.gs`.
3. **Deploy it as a Web App** (Deploy → New deployment → Web app). Copy the Web App URL.
4. In **Project Settings → Script Properties**, add:

   | Property | Value |
   |---|---|
   | `CLIENT_ID` | Your Intuit app's Client ID |
   | `CLIENT_SECRET` | Your Intuit app's Client Secret |
   | `REDIRECT_URI` | The Web App URL from step 3 |

5. Add the same Web App URL as a **Redirect URI** in the Intuit developer portal. It must match exactly.
6. Reload the sheet, then click **QuickBooks Integration → Authorize App**.

> **Security note:** anyone with edit access to the spreadsheet can open the script editor and read Script Properties, which hold the client secret and the tokens. Only give edit access to people who should be able to reach your books.

## Notes

- This uses the QuickBooks **production** API. For sandbox testing, change `PRODUCTION_API_URL` to `https://sandbox-quickbooks.api.intuit.com/v3/company/`.
- Balances of $2 or less (rounding leftovers) are ignored when loading invoices (`MIN_BALANCE`).
- Edit the support contact in `showSupportModal()` before you use it.
