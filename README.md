# Collection Operating System

![JavaScript](https://img.shields.io/static/v1?label=&message=JavaScript&color=F7DF1E&style=flat-square&logo=javascript&logoColor=black)
![Google Apps Script](https://img.shields.io/static/v1?label=&message=Google%20Apps%20Script&color=4285F4&style=flat-square&logo=googleappsscript&logoColor=white)
![Google Sheets](https://img.shields.io/static/v1?label=&message=Google%20Sheets&color=34A853&style=flat-square&logo=googlesheets&logoColor=white)
![Excel](https://img.shields.io/static/v1?label=&message=Excel&color=217346&style=flat-square&logo=microsoftexcel&logoColor=white)
![QuickBooks API](https://img.shields.io/static/v1?label=QuickBooks&message=API%20integration&color=2CA01C&style=flat-square&logo=quickbooks&logoColor=white)
![OAuth 2.0](https://img.shields.io/static/v1?label=Auth&message=OAuth%202.0&color=EB5424&style=flat-square)
![Credit risk](https://img.shields.io/static/v1?label=Credit%20risk&message=customer%20scoring&color=B42318&style=flat-square)
![Accounts receivable](https://img.shields.io/static/v1?label=Accounts%20receivable&message=collections&color=475569&style=flat-square)
![Pricing](https://img.shields.io/static/v1?label=Pricing&message=payment%20terms%20strategy&color=B45309&style=flat-square)
![Financial reporting](https://img.shields.io/static/v1?label=Financial&message=KPI%20reporting&color=0F766E&style=flat-square)
![Automation](https://img.shields.io/static/v1?label=Process&message=automation&color=5C4EE5&style=flat-square)

**The point of this system is to rate every customer on how reliably they pay, calculate their risk rate, and use that rating to decide how hard to follow up with them and what payment terms and pricing to offer them next time.**

This is the accounts-receivable (AR) collections system I designed and built. It has two parts:

1. **A QuickBooks Online integration** written in JavaScript (Google Apps Script). It pulls invoices and payments straight from QuickBooks into Google Sheets.
2. **A customer-rating workbook** that turns every payment into an on-time reliability rate, a 🟢 / 🟡 / 🔴 risk rating, and recommended terms for that customer's next order.

> 💻 **Script:** [`src/Code.gs`](src/Code.gs)
> 📊 **Workbook:** [download `Collections-Operating-System.xlsx`](https://github.com/ghorbanianhamed/collection-operating-system/raw/main/sample/Collections-Operating-System.xlsx). GitHub can't preview Excel files, so **see the screenshots below, or browse each tab as a table** in [`sample/csv/`](sample/csv).
> The structure, formulas and code are the real ones. **The data covers 255 customers, shown as codes `CUST-001` … `CUST-255`, and 1,300 paid invoices. All invoice numbers and amounts are fictional.**

---

## Skills & technologies

### Technologies

| Area | Used in this project |
|---|---|
| **Language** | JavaScript (Google Apps Script, V8 runtime) |
| **Platform** | Google Sheets, Google Apps Script, Microsoft Excel (.xlsx) |
| **API integration** | QuickBooks Online Accounting API (REST + JSON); QuickBooks query language (`SELECT … FROM Invoice / CreditMemo / Payment`); paginated requests |
| **Authentication & security** | OAuth 2.0 authorization-code flow; access and refresh tokens with automatic refresh; CSRF protection with a one-time `state` value; credentials kept out of the code in Script Properties; token revocation on logout |
| **Apps Script services** | `UrlFetchApp` (HTTP calls), `HtmlService` + `doGet()` (OAuth callback web app), `PropertiesService` (credential storage), `LockService` (stops two refreshes running at once), `SpreadsheetApp` (custom menu, sheet updates, sorting, formatting) |
| **Spreadsheet engineering** | Dynamic array formulas (`MAP`, `LAMBDA`, `SORT`, `UNIQUE`, `FILTER`), `SUMIFS` / `COUNTIFS` / `AVERAGEIFS`, `VLOOKUP`, `IFERROR`, `TODAY()`/`WEEKDAY()` date windows, data validation dropdowns, conditional formatting, cross-tab lookups |
| **Version control & docs** | Git, GitHub, Markdown, Mermaid diagrams |

### Skills

| Skill | Where it shows |
|---|---|
| **Customer credit-risk scoring** | On-time reliability rate per customer, turned into a 🟢 / 🟡 / 🔴 rating |
| **Payment terms & pricing strategy** | Six term tiers, from an early-payment discount down to cash in advance, set automatically by each customer's risk |
| **Accounts receivable & collections** | A full weekly cycle: pull, prioritize, follow up, confirm payment, archive |
| **Financial reporting & KPIs** | CFO dashboard: Expected This Week, Confirmed, At Risk, Promised vs. Collected, Variance |
| **Process automation** | One-click menu that replaces manual QuickBooks exports and copy-paste |
| **Systems integration** | Connecting an accounting system (QuickBooks Online) to a reporting tool (Google Sheets) |
| **Data modeling** | Linked tabs: Invoices → weekly report → Master AR Log → Scorecard → back to the weekly report |
| **Data quality controls** | Duplicate prevention, checking payments against QuickBooks before archiving, and the audit tool |
| **Data privacy** | Customer codes in place of names, fictional amounts, and no credentials in the code |
| **Process documentation** | In-workbook integration guide, README, weekly operating routine |

---

## See the workbook

| Tab | Screenshot | Browse in GitHub |
|---|---|---|
| **QuickBooks Integration** | [page 1](docs/screenshots/quickbooks-integration-1.png) · [page 2](docs/screenshots/quickbooks-integration-2.png) | (documentation tab) |
| **Weekly AR Collections (CFO)** | [view](docs/screenshots/weekly-ar-collections-cfo.png) | [weekly-ar-collections-cfo.csv](sample/csv/weekly-ar-collections-cfo.csv) |
| **Customer Reliability Scorecard** | [view](docs/screenshots/customer-reliability-scorecard.png) | [customer-reliability-scorecard.csv](sample/csv/customer-reliability-scorecard.csv) (all 255 customers) |
| **Master AR Log** | [view](docs/screenshots/master-ar-log.png) | [master-ar-log.csv](sample/csv/master-ar-log.csv) (all 1,300 invoices) |
| **Invoices** | [view](docs/screenshots/invoices.png) | [invoices.csv](sample/csv/invoices.csv) |

### Customer Reliability Scorecard: each customer's risk rate, rating and terms
![Customer Reliability Scorecard](docs/screenshots/customer-reliability-scorecard.png)

### Weekly AR Collections (CFO): the weekly report, with each customer's live rating and terms
![Weekly AR Collections (CFO)](docs/screenshots/weekly-ar-collections-cfo.png)

### QuickBooks Integration tab: how the integration works
![QuickBooks Integration tab](docs/screenshots/quickbooks-integration-1.png)

<details>
<summary>More screenshots: Master AR Log and Invoices</summary>

![Master AR Log](docs/screenshots/master-ar-log.png)

![Invoices](docs/screenshots/invoices.png)

![QuickBooks Integration tab, page 2](docs/screenshots/quickbooks-integration-2.png)
</details>

---

## How it works

```mermaid
flowchart TD
    QBO[QuickBooks Online] -->|OAuth 2.0 + REST API| JS[Google Apps Script<br/>JavaScript]
    JS -->|1. Pull Invoices| INV[Invoices tab]
    INV -->|2. Load New Invoices| CFO[Weekly AR Collections CFO]
    QBO -->|3. Sync Paid Dates| CFO
    CFO -->|4. Archive Paid Invoices| LOG[Master AR Log]
    LOG -->|formulas| SC[Customer Reliability Scorecard<br/>reliability % → 🟢🟡🔴 → terms]
    SC -->|rating + terms on every open invoice| CFO
```

---

## Part 1: the QuickBooks integration (JavaScript)

The script adds a **QuickBooks Integration** menu to Google Sheets:

<img src="docs/quickbooks-menu.png" alt="QuickBooks Integration menu in Google Sheets" width="300">

| Menu item | JavaScript function | What it does | Tab it updates |
|---|---|---|---|
| **Authorize App** | `startOAuthFlow()` → `doGet()` | Opens the Intuit login. After approval, Intuit redirects back to the script's web app. The app swaps the one-time code for access and refresh tokens and stores them in Script Properties. | — |
| **1. Pull Invoices from QBO** | `fetchInvoices()` | Queries every open Invoice and Credit Memo (1,000 per page), sorts them by customer, writes the list with a grand total, and highlights overdue due dates. | Invoices |
| **2. Load New Invoices to Weekly Report** | `loadNewInvoicesToWeeklyReport()` | Adds invoices due in the next 14 days or already past due (balance over $2) that aren't on the report yet. Adds the Status dropdown and the Risk Rating / Recommended Terms lookups, then sorts by due date. | Weekly AR Collections (CFO) |
| **3. Sync Paid Dates from QBO** | `syncPaidDatesFromQBO()` | Asks QuickBooks which invoices are now fully paid, finds the Payment applied to each one, marks the row **Paid** and writes the real payment date. Warns about rows marked Paid that QuickBooks doesn't show as paid. | Weekly AR Collections (CFO) |
| **4. Archive Paid Invoices** | `closeOutLastWeek()` | Moves confirmed-paid rows to the Master AR Log. Refuses rows that QuickBooks still shows open, and never logs the same invoice twice. **This is what feeds the customer ratings.** | Master AR Log |
| **Accident-Proofing** | `buildModernCFODashboardHeader()` | Rebuilds the six KPI tiles and their live formulas if someone breaks the top of the report. | Weekly AR Collections (CFO) |
| **Audit Master AR Log** | `auditMasterARLog()` | Highlights duplicate rows, and rows logged as paid that QuickBooks still shows open. Deletes nothing. | Master AR Log |
| **Reset Connection / Logout** | `clearOAuthTokens()` | Revokes the token at Intuit and clears the stored credentials. | — |

### How the connection works (OAuth 2.0)

1. **Authorize:** the script builds an Intuit login link with a random one-time `state` value (CSRF protection) and the `com.intuit.quickbooks.accounting` scope.
2. **Callback:** Intuit redirects to the script's web app. `doGet()` checks that the `state` matches, then saves the company ID (`realmId`).
3. **Tokens:** the code is exchanged for an access token (valid about 1 hour) and a refresh token. Both are kept in **Script Properties**, never in the sheet or the code.
4. **Auto-refresh:** `getValidAccessToken()` refreshes the token 60 seconds before it expires, with a lock so two clicks can't refresh at the same time.

### QuickBooks API queries

| Purpose | Query |
|---|---|
| Open invoices | `SELECT * FROM Invoice WHERE Balance > '0.00'` |
| Open credit memos | `SELECT * FROM CreditMemo WHERE Balance > '0.00'` |
| Recently paid invoices | `SELECT * FROM Invoice WHERE Balance = '0.00' AND MetaData.LastUpdatedTime >= '<60 days ago>'` |
| Payment dates | `SELECT * FROM Payment WHERE TxnDate >= '<60 days ago>'` (linked to invoices to get the real paid date) |

All queries page through results with `STARTPOSITION` / `MAXRESULTS` (`qboQueryAll()`), so large accounts aren't cut off at QuickBooks' 100-row default.

### Setup (for your own QuickBooks company)

1. Create an app at [developer.intuit.com](https://developer.intuit.com) with the `com.intuit.quickbooks.accounting` scope.
2. In Google Sheets, open **Extensions → Apps Script** and paste in `src/Code.gs`.
3. Deploy it as a **Web App** and copy the URL.
4. In **Project Settings → Script Properties**, add `CLIENT_ID`, `CLIENT_SECRET` and `REDIRECT_URI` (the Web App URL). Optionally add `SUPPORT_CONTACT`, the contact shown under Help & Support.
5. Add the same URL as a Redirect URI in the Intuit portal, reload the sheet, then click **QuickBooks Integration → Authorize App**.

> Anyone with edit access to the spreadsheet can read Script Properties, which hold the credentials, so only give edit access to people you trust with your books.

---

## Part 2: customer ratings

### How a customer gets rated

1. **Every paid invoice is logged** in the **Master AR Log** with its promised date and the date it was actually paid.
2. **On Time?** = `Yes` if it was paid on or before the promised date. **Days Variance** = how many days late it was.
3. **Risk rate:** **On-Time Reliability % = on-time payments ÷ total invoices paid**, per customer.
4. **The color sets how hard to follow up, and the band inside each color sets the terms:**

| Rating | On-Time Reliability % | Recommended Terms / Pricing | Follow-up |
|---|---|---|---|
| 🟢 Green | **90% or more** | **Standard Terms + 2% early-payment discount** | Email reminder before the due date |
| 🟢 Green | **80% – 89%** | **Standard Terms** | Email reminder before the due date |
| 🟡 Amber | **65% – 79%** | **Net 15** | Phone call to confirm date, amount and payment method |
| 🟡 Amber | **50% – 64%** | **Net 15 + 25% deposit on new orders** | Phone call to confirm date, amount and payment method |
| 🔴 Red | **30% – 49%** | **COD** (cash on delivery) | Phone call, escalate to the owner |
| 🔴 Red | **Under 30%** | **CIA** (cash in advance) | Phone call, escalate, hold new orders |

Every customer's rating and terms update automatically each time an invoice is archived. The terms also appear on the weekly report next to every open invoice, so the team sees them before quoting or shipping the next order.

### Customer codes
Customers are identified by **customer codes** (`CUST-001` … `CUST-255`) instead of names, on every tab. The sample Master AR Log holds **1,300 paid invoices**, so the Scorecard rates **255 customers** across all six term tiers.

---

## The workbook tabs

| Tab | Purpose |
|---|---|
| **QuickBooks Integration** | Documentation of the integration: data flow, the menu and its JavaScript functions, OAuth, API queries, rating rules and the weekly routine |
| **Weekly AR Collections (CFO)** | One-page weekly report: six KPI tiles plus every invoice due in the next 14 days or past due, with each customer's live rating and terms |
| **Customer Reliability Scorecard** | Builds itself from the Master AR Log: total invoices, on-time payments, missed promises, **reliability %**, average days late, **risk rating**, **recommended terms** |
| **Master AR Log** | Permanent history of paid invoices (1,300 in the sample); **On Time?** and **Days Variance** are calculated |
| **Invoices** | The open invoices and credit memos pulled from QuickBooks, with a grand total |

### KPI tiles on the CFO report

| Tile | What it shows |
|---|---|
| **Expected This Week** | Open invoices expected to be paid this week |
| **Confirmed (🟢)** | The part owed by 🟢 customers |
| **At Risk (🟡 + 🔴)** | Expected minus Confirmed |
| **Last Week Promised** | Everything customers promised to pay last week |
| **Collected Last Week** | What was actually paid last week |
| **Variance** | Promised minus Collected: broken promises |

**Status dropdown values:** Confirmed · Promised · Approved · In process · Disputed · Unresponsive · Not contacted · Paid

### Weekly routine

| When | Menu steps | Result |
|---|---|---|
| Monday | **1. Pull Invoices → 2. Load New Invoices** | This week's collection list, with every customer rated |
| Tue – Thu | Work the list, 🔴 and 🟡 first | Statuses, expected dates and notes updated |
| Friday | **3. Sync Paid Dates → 4. Archive Paid Invoices** | Paid invoices logged; every customer re-rated automatically |

---

## Opening the workbook

**Use Google Sheets:** File → Import → Upload → *Replace spreadsheet*. The Scorecard uses Google Sheets array formulas (`SORT`, `UNIQUE`, `FILTER`, `MAP`, `LAMBDA`), so Excel shows those columns as static values instead of recalculating them.

> Excel limits tab names to 31 characters, so two tabs are named **Weekly AR Collections (CFO)** and **Customer Reliability Scorecard**.
