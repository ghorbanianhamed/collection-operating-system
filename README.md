# Collection Operating System

**The point of this system is to rate every customer on how reliably they pay, turn that into a risk rating, and use the rating to decide how hard to follow up with them and what terms and pricing to offer them next time.**

It's a set of linked spreadsheet tabs that I built to run weekly accounts-receivable (AR) collections. Every paid invoice feeds a customer scorecard, and each customer's rating flows back into the weekly collections view. So whoever chases payments always knows **who is a risk, how hard to follow up, and whether to tighten terms or change pricing.**

> 📊 **Sample workbook:** [`sample/Collection-Operating-System-Sample.xlsx`](sample/Collection-Operating-System-Sample.xlsx)
> All customer names, invoice numbers and amounts in it are **fictional sample data**.

---

## How a customer gets rated

```
 Paid invoice ──► Master AR Log ──► Scorecard ──► Risk Rating ──► Terms · Follow-Up · Pricing
                  (on time? how      (reliability   🟢 🟡 🔴        (Rating Rules tab)
                   many days late?)   rate %)                              │
                                                                           ▼
                                               Weekly AR Collections (CEO) shows the rating
                                               and terms next to every open invoice
```

1. **Every paid invoice is logged** in the **Master AR Log** with its promised date and the date it was actually paid.
2. **On time or late?**
   - **On Time?** = `Yes` if the invoice was paid on or before the **Promised Date**. If no promise was made, the **Due Date** is used instead.
   - **Days Variance** = how many days late (or early, if negative) the payment was.
3. **Reliability rate:** **On-Time Reliability % = on-time payments ÷ total invoices paid**, for each customer.
4. **Risk rating:**

   | Rating | Rule (default) | Risk |
   |---|---|---|
   | 🟢 | Reliability **≥ 80%** | Low |
   | 🟡 | Reliability **≥ 50%** and < 80% | Medium |
   | 🔴 | Reliability **< 50%** | High |
   | No History | No paid invoices yet | Unknown |

5. **Action:** each rating sets the customer's **Recommended Terms**, **Follow-Up Plan** and **Pricing Action**:

   | Rating | Recommended Terms | Follow-Up Plan | Pricing Action |
   |---|---|---|---|
   | 🟢 | Standard Terms | Courtesy reminder 3 days before the due date | Standard pricing. Eligible for an early-payment discount. |
   | 🟡 | Net 15 | Reminder 7 days before due, a call on the due date, then every 3 days | No discounts. Consider a deposit or late-fee clause on new orders. |
   | 🔴 | CIA (cash in advance) | Call weekly from the due date; escalate to the owner at 7 days late; hold new orders | Cash in advance on new orders. Add a risk premium to quoted prices. |

   The thresholds and actions live on the **Rating Rules** tab. Change a yellow cell there and every customer is re-rated instantly.

---

## The tabs

### 1. How It Works
A one-page summary of the system and a guide to the tabs.

### 2. Weekly AR Collections (CEO)
The weekly page for the CEO and the collections team.

**KPI tiles (rows 1–6):**

| Tile | What it shows |
|---|---|
| **Expected This Week** | Open invoices expected to be paid this week (Sunday to Saturday). It uses the **Expected Pay Date**, or the **Due Date** if no expected date has been entered. Rows marked Paid are excluded. |
| **Confirmed (🟢)** | The part of Expected This Week owed by customers rated 🟢. |
| **At Risk (🟡 + 🔴)** | Expected This Week minus Confirmed: money owed by risky customers. |
| **Last Week Promised** | Everything customers promised to pay last week. |
| **Collected Last Week** | What was actually paid last week, from the Master AR Log. |
| **Variance** | Promised minus Collected. A positive number means customers broke promises. |

**Table: UPCOMING & OPEN INVOICES (next 14 days and past due)**

| Column | Filled by | Meaning |
|---|---|---|
| Invoice, Customer, Amount, Due Date | Invoices tab | The open invoice |
| Expected Pay Date | You | The date the customer says they'll pay |
| Status | You (dropdown) | Confirmed · Promised · Approved · In process · Disputed · Unresponsive · Not contacted · Paid |
| Last Contact / Next Touchpoint | You | Your follow-up log |
| **Risk Rating** | Formula | The customer's live rating from the Scorecard |
| Risk Note | You | Context, e.g. "disputing short shipment" |
| **Recommended Terms** | Formula | Terms from the Scorecard |
| Actual Paid Date | You | Filled in when the invoice is paid |

### 3. Customer Reliability Scorecard
**The heart of the system.** There is one row per customer, and every column is a formula calculated from the Master AR Log:

| Column | Formula logic |
|---|---|
| Total Invoices | Number of paid invoices for the customer |
| On-Time Payments | Paid invoices where On Time? = Yes |
| Missed Promises | Total minus On-Time |
| **On-Time Reliability %** | On-Time ÷ Total. **This is the customer's risk rate.** |
| Avg Days Late | Average days late, counting late payments only |
| **Current Risk Rating** | 🟢 / 🟡 / 🔴, using the thresholds on Rating Rules |
| **Recommended Terms** | From Rating Rules |
| **Follow-Up Plan** | From Rating Rules |
| **Pricing Action** | From Rating Rules |
| Open AR Balance | What the customer owes right now (from the Invoices tab): your exposure to that customer |

### 4. Rating Rules
The only settings you need to touch:
- The 🟢 and 🟡 reliability thresholds.
- The terms, follow-up plan and pricing action for each rating.

Yellow cells are inputs.

### 5. Master AR Log
The history of every paid invoice, newest first. **On Time?** and **Days Variance** are formulas. The ratings are only as good as this log, so:
- Log each invoice **once**.
- Only log an invoice as Paid when the payment is actually received.

### 6. Invoices
The list of open invoices and credit memos: Invoice ID, Doc Number, Customer, Txn Date, Due Date, Total and Balance, with a grand total. Credit memos are shown with negative amounts. Balances of $2 or less (rounding leftovers) are ignored by the CEO view.

---

## Weekly routine

1. **Monday:** update the **Invoices** tab with this week's open invoices, and add any new ones due in the next 14 days (or past due) to the CEO view.
2. **During the week:** chase payments in the order the **Risk Rating** and **Follow-Up Plan** suggest (🔴 first). Record Status, Expected Pay Date, Last Contact and Next Touchpoint.
3. **When a payment arrives:** set Status to **Paid** and enter the **Actual Paid Date**.
4. **End of week:** move Paid rows to the **Master AR Log**. The Scorecard re-rates every customer automatically, and next week's terms, follow-ups and pricing follow from it.
5. **When quoting or taking a new order:** check the customer's **Recommended Terms** and **Pricing Action** on the Scorecard first.

---

## Using the sample

- **Google Sheets:** File → Import → Upload `Collection-Operating-System-Sample.xlsx` → *Replace spreadsheet*.
- **Excel:** open the file directly.

The KPI tiles use `TODAY()`, so they move with the calendar. The sample's dates are set around November 2026.

> Excel limits tab names to 31 characters, so two tabs in this sample have shorter names than in my working version: **Weekly AR Collections (CEO)** and **Customer Reliability Scorecard**.

---

## Optional: automation script

[`src/Code.gs`](src/Code.gs) is the Google Apps Script I wrote to automate the weekly routine in my working copy. It isn't needed to use the sheets. It adds a menu that:
- refreshes the Invoices tab from QuickBooks Online,
- loads new invoices into the CEO view,
- marks paid invoices,
- archives them to the Master AR Log,
- rebuilds the KPI tiles,
- audits the log for duplicates.

Setting it up requires your own QuickBooks developer app. The `CLIENT_ID`, `CLIENT_SECRET` and `REDIRECT_URI` go in Script Properties and are never stored in the code.
