# Collection Operating System

**The point of this system is to rate every customer on how reliably they pay, calculate their risk rate, and use that rating to decide how hard to follow up with them and what payment terms and pricing to offer them next time.**

This is the accounts-receivable (AR) workbook I designed and ran for weekly collections. Every paid invoice feeds a customer scorecard, and each customer's risk rating flows back into the weekly CEO report. So whoever chases payments always knows **who is a risk, who to call first, and when to tighten a customer's terms.**

> 📊 **Workbook:** [`sample/Collections-Operating-System.xlsx`](sample/Collections-Operating-System.xlsx)
> The structure, formulas and workflow are the real ones. **All customer names, invoice numbers, amounts and staff names have been replaced with fictional data.**

---

## How a customer gets rated

```
 Paid invoice ──► Master AR Log ──► Scorecard ──────► Risk Rating ──► Terms & Follow-Up
                  (on time? days    (on-time          🟢 🟡 🔴         (Standard / Net 15 / CIA,
                   late?)            reliability %)                     email vs. phone)
                                                                              │
                                                                              ▼
                                            Weekly AR Collections (CEO) shows the rating
                                            and terms next to every open invoice
```

1. **Every paid invoice is logged** in the **Master AR Log** with its promised date and the date it was actually paid.
2. **On time or late?**
   - **On Time?** = `Yes` if the invoice was paid on or before the **Promised Date**.
   - **Days Variance** = the number of days between the promised date and the payment.
3. **Risk rate:** **On-Time Reliability % = on-time payments ÷ total invoices paid**, for each customer.
4. **Risk rating and the action that follows:**

   | Rating | Rule | Recommended Terms | Follow-Up |
   |---|---|---|---|
   | 🟢 Green | Reliability **≥ 80%** | **Standard Terms** | Email reminder |
   | 🟡 Amber | Reliability **≥ 50%** and < 80% | **Net 15**: shorter credit | Phone call to confirm date, amount and payment method |
   | 🔴 Red | Reliability **< 50%** | **CIA**: cash in advance, no credit | Phone call. Escalate. |

   The **Recommended Terms** are the pricing and credit decision. A 🔴 customer has to pay before the next order ships, and a 🟡 customer gets less time to pay.

---

## The tabs

### 1. Weekly AR Collections (CEO)
The one-page weekly report for the CEO.

**KPI tiles (rows 1–6):**

| Tile | What it shows |
|---|---|
| **Expected This Week** | Open invoices with an Expected Pay Date in this week |
| **Confirmed (🟢)** | The part of Expected This Week owed by 🟢 customers |
| **At Risk (🟡 + 🔴)** | Expected This Week minus Confirmed |
| **Last Week Promised** | Everything customers promised to pay last week (this tab and the Master AR Log) |
| **Collected Last Week** | What was actually paid last week, from the Master AR Log |
| **Variance** | Promised minus Collected: how much of last week's promises were broken |

**Table: UPCOMING & OPEN INVOICES (next 14 days and past due)**

| Column | Meaning |
|---|---|
| Invoice · Customer · Amount · Due Date | The open invoice |
| Expected Pay Date | The date the customer committed to |
| Status | A dropdown (see the definitions below) |
| Last Contact · Next Touchpoint | The follow-up log |
| **Risk Rating** | Formula: the customer's live rating from the Scorecard |
| Risk Note | Context, e.g. a dispute or a cash-flow problem |
| **Recommended Terms** | Formula: the customer's terms from the Scorecard |
| Actual Paid Date | Filled in when the payment arrives |

### 2. Customer Reliability Scorecard
**The heart of the system.** It builds itself: the customer list and every column are formulas over the Master AR Log.

| Column | Calculation |
|---|---|
| Customer Name | Every customer that appears in the Master AR Log |
| Total Invoices | Number of paid invoices |
| On-Time Payments | Paid invoices where On Time? = Yes |
| Missed Promises | Paid invoices where On Time? = No |
| **On-Time Reliability %** | On-Time ÷ Total. **This is the customer's risk rate.** |
| Avg Days Late | Average Days Variance of the late payments |
| **Current Risk Rating** | 🟢 ≥ 80% · 🟡 ≥ 50% · 🔴 below 50% |
| **Recommended Terms** | 🟢 Standard Terms · 🟡 Net 15 · 🔴 CIA |

### 3. Master AR Log
The permanent history of paid invoices: Invoice, Customer, Amount, Due Date, Promised Date, Status, Last Contact, Next Touchpoint, Risk (the rating when it was paid), Risk Note and Actual Paid Date. **On Time?** and **Days Variance** are calculated. The ratings are only as good as this log, so log each invoice once, and only once the payment has actually arrived.

### 4. Invoices
Every open invoice and credit memo: Invoice ID, Doc Number, Customer, Txn Date, Due Date, Total Amount and Balance, with a grand total.
- Overdue due dates are highlighted.
- Credit memos show negative amounts.

### 5. Instructions & SOP
The operating procedure: who does what, on which day, with which tab, plus the definitions below.

---

## Weekly operating routine

| Day | Owner | Task | Tab |
|---|---|---|---|
| Monday AM | AR Manager & AR Specialist | Close out last week's results in the Master AR Log. Load invoices due in the next 14 days, plus open past-dues, into the weekly report. | Master AR Log → Weekly Report |
| Monday AM | AR Specialist | Send the list of active accounts to the Operations Lead for a quality/delivery dispute check | Weekly Report |
| Tuesday | AR Manager & AR Specialist | Clear internal invoice blockers. Resolve delivery/PO issues with Operations **before** contacting the customer. | Weekly Report |
| Wednesday | AR Specialist | Contact every customer: **email 🟢 accounts; call 🟡 and 🔴 accounts** to confirm the date, amount and payment method | Weekly Report |
| Thursday | AR Specialist | Follow up with non-responders **by phone (never a second email)**. Update statuses and risk notes. | Weekly Report |
| Friday AM | AR Specialist | Deliver the one-page weekly AR report to the CEO. Flag exceptions only. | Weekly Report |

### Status definitions

| Status | Meaning |
|---|---|
| Confirmed | Payment is scheduled in the customer's AP run for a named date |
| Promised | A person gave us a date, but their AP system hasn't confirmed it |
| Approved | Invoice is approved in their AP system but not yet scheduled |
| In process | Sitting in their approval workflow, with no date given yet |
| Disputed | The customer is contesting the amount, scope or documentation |
| Unresponsive | No real reply in two or more contact cycles |
| Not contacted | We haven't tried to contact them about this invoice this cycle |
| Paid | Payment received |

### Risk rating definitions (judgement guide)

| Rating | Signals |
|---|---|
| 🟢 Green | Confirmed status, no open dispute, paid on time 2+ times in a row |
| 🟡 Amber | Promised but unconfirmed, first payment, date moved, or a documentation issue |
| 🔴 Red | 2+ broken promises, disputed, unresponsive, more than 30 days past due, or signs of financial distress |

---

## Opening the workbook

**Use Google Sheets:** File → Import → Upload → *Replace spreadsheet*. The Scorecard uses Google Sheets array formulas (`SORT`, `UNIQUE`, `FILTER`, `MAP`, `LAMBDA`), so Excel will show those columns as static values instead of recalculating them. The KPI tiles use `TODAY()`, so they move with the calendar.

> Excel limits tab names to 31 characters, so two tabs are named **Weekly AR Collections (CEO)** and **Customer Reliability Scorecard**.

---

## Optional: automation script

[`src/Code.gs`](src/Code.gs) is a Google Apps Script that can automate the weekly routine: loading invoices, marking payments, archiving to the Master AR Log, rebuilding the KPI tiles and auditing the log. **It isn't needed to use the workbook, and this repository isn't connected to any accounting system.** To use it you need your own QuickBooks Online developer app, with its credentials stored in Script Properties (never in the code).
