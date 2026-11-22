/**
 * COLLECTION OPERATING SYSTEM — QuickBooks Online → Google Sheets AR collections tracker
 *
 * Changes from the previous version are marked "FIX:" in the comments.
 */

var AUTHORIZATION_BASE_URL = 'https://appcenter.intuit.com/connect/oauth2';
var TOKEN_URL              = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
var REVOKE_URL             = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
var PRODUCTION_API_URL     = 'https://quickbooks.api.intuit.com/v3/company/';
var QBO_MINOR_VERSION      = '75';

var CEO_TAB       = 'Weekly AR Collections (CEO VIEW)';
var MASTER_TAB    = 'Master AR Log';
var INVOICES_TAB  = 'Invoices';
var SCORECARD_TAB = 'Customer Payment Reliability Scorecard';
var TABLE1_TITLE  = 'UPCOMING & OPEN INVOICES';
var CEO_COLS      = 12;   // A..L on the CEO View (L = Actual Paid Date)
var MIN_BALANCE   = 2;    // ignore penny balances left over in QBO
var STATUS_LIST   = ['Confirmed', 'Promised', 'Approved', 'In process', 'Disputed',
                     'Unresponsive', 'Not contacted', 'Paid'];

/**
 * Creates custom menu items inside Google Sheets.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QuickBooks Integration')
    .addItem('Authorize App', 'startOAuthFlow')
    .addItem('1. Pull Invoices from QBO', 'fetchInvoices')
    .addItem('2. Load New Invoices to Weekly Report', 'loadNewInvoicesToWeeklyReport')
    .addItem('3. Sync Paid Dates from QBO', 'syncPaidDatesFromQBO')
    .addItem('4. Archive Paid Invoices', 'closeOutLastWeek')
    .addItem('Accident-Proofing', 'buildModernCEODashboardHeader')
    .addItem('Audit Master AR Log', 'auditMasterARLog')
    .addSeparator()
    .addItem('Help & Support', 'showSupportModal')
    .addItem('Reset Connection / Logout', 'clearOAuthTokens')
    .addToUi();
}

/* =========================================================================
 * OAUTH
 * ========================================================================= */

/**
 * Redirect URI registered in the Intuit Developer portal.
 * Set REDIRECT_URI in Script Properties to your deployed Web App URL
 * (Deploy > Manage deployments > Web app URL). Storing the exact URL avoids
 * Google Workspace domain mismatch errors.
 */
function getRedirectUri() {
  var uri = PropertiesService.getScriptProperties().getProperty('REDIRECT_URI');
  return uri || ScriptApp.getService().getUrl();
}

/**
 * Generates the Intuit OAuth 2.0 Login URL and shows it in a dialog.
 */
function startOAuthFlow() {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('CLIENT_ID');

  if (!clientId) {
    SpreadsheetApp.getUi().alert('Missing CLIENT_ID in Script Properties.');
    return;
  }

  var redirectUri = getRedirectUri();
  var state = Utilities.getUuid(); // CSRF protection token
  props.setProperty('OAUTH_STATE', state);

  var authUrl = AUTHORIZATION_BASE_URL +
    '?client_id=' + encodeURIComponent(clientId) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent('com.intuit.quickbooks.accounting') +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&state=' + encodeURIComponent(state);

  var htmlOutput = HtmlService.createHtmlOutput(
    '<p>Click the link below to authorize access to your QuickBooks account:</p>' +
    '<a href="' + authUrl + '" target="_blank" style="font-size:16px; font-weight:bold;">Connect to QuickBooks</a>' +
    '<br><br><small>Redirect URI configured in Intuit:<br><code>' + redirectUri + '</code></small>'
  ).setWidth(450).setHeight(180);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'QuickBooks Authorization');
}

/**
 * Web Application Callback Endpoint handling the OAuth redirect from Intuit.
 */
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var p = (e && e.parameter) || {};
  var savedState = props.getProperty('OAUTH_STATE');

  // FIX: handle the user clicking "Cancel" on the Intuit screen
  if (p.error) {
    return HtmlService.createHtmlOutput('<h2>Authorization Cancelled</h2><p>' + escapeHtml_(p.error) + '</p>');
  }

  // Verify state token to prevent CSRF attacks
  if (!p.state || p.state !== savedState) {
    return HtmlService.createHtmlOutput('Error: State token mismatch. Potential CSRF security violation.');
  }
  props.deleteProperty('OAUTH_STATE'); // FIX: state is single-use

  if (p.code && p.realmId) {
    props.setProperty('REALM_ID', p.realmId);
    if (exchangeCodeForTokens(p.code)) {
      return HtmlService.createHtmlOutput('<h2>Authorization Successful!</h2><p>You may now close this browser tab and return to Google Sheets.</p>');
    }
  }

  return HtmlService.createHtmlOutput('<h2>Authorization Failed</h2><p>Could not retrieve access tokens from Intuit.</p>');
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function basicAuthHeader_() {
  var props = PropertiesService.getScriptProperties();
  return 'Basic ' + Utilities.base64Encode(props.getProperty('CLIENT_ID') + ':' + props.getProperty('CLIENT_SECRET'));
}

function postToTokenEndpoint_(payload) {
  return UrlFetchApp.fetch(TOKEN_URL, {
    method: 'post',
    headers: {
      Authorization: basicAuthHeader_(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    payload: payload,
    muteHttpExceptions: true
  });
}

function saveTokens_(tokenData) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('ACCESS_TOKEN', tokenData.access_token);
  props.setProperty('REFRESH_TOKEN', tokenData.refresh_token);
  props.setProperty('EXPIRES_AT', String(new Date().getTime() + tokenData.expires_in * 1000));
}

/**
 * Exchanges the auth authorization code for Access & Refresh tokens.
 */
function exchangeCodeForTokens(code) {
  var response = postToTokenEndpoint_({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: getRedirectUri()
  });
  if (response.getResponseCode() === 200) {
    saveTokens_(JSON.parse(response.getContentText()));
    return true;
  }
  Logger.log('Token Exchange Error: ' + response.getContentText());
  return false;
}

/**
 * Retrieves a valid Access Token, automatically refreshing it if expired.
 * FIX: a lock stops two menu clicks from refreshing at the same time
 * (Intuit rotates the refresh token, so a double refresh can log you out).
 */
function getValidAccessToken() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var accessToken = props.getProperty('ACCESS_TOKEN');
    var refreshToken = props.getProperty('REFRESH_TOKEN');
    var expiresAt = parseInt(props.getProperty('EXPIRES_AT') || '0', 10);

    if (accessToken && new Date().getTime() < (expiresAt - 60000)) {
      return accessToken;
    }
    return refreshToken ? refreshAccessToken(refreshToken) : null;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Uses the Refresh Token to obtain a new Access Token.
 */
function refreshAccessToken(refreshToken) {
  var response = postToTokenEndpoint_({ grant_type: 'refresh_token', refresh_token: refreshToken });
  if (response.getResponseCode() === 200) {
    var tokenData = JSON.parse(response.getContentText());
    saveTokens_(tokenData);
    return tokenData.access_token;
  }
  Logger.log('Token Refresh Error: ' + response.getContentText());
  return null;
}

/**
 * FIX: this function was missing, so "Reset Connection / Logout" errored.
 * Revokes the token at Intuit and clears everything stored locally.
 */
function clearOAuthTokens() {
  var props = PropertiesService.getScriptProperties();
  var refresh = props.getProperty('REFRESH_TOKEN');
  if (refresh) {
    UrlFetchApp.fetch(REVOKE_URL, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: { Authorization: basicAuthHeader_(), Accept: 'application/json' },
      payload: JSON.stringify({ token: refresh })
    });
  }
  ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRES_AT', 'REALM_ID', 'OAUTH_STATE'].forEach(function (k) {
    props.deleteProperty(k);
  });
  SpreadsheetApp.getUi().alert('Disconnected from QuickBooks.\n\nUse "Authorize App" to reconnect.');
}

/* =========================================================================
 * QBO API HELPERS
 * ========================================================================= */

/**
 * FIX: QBO returns at most 100 rows per query by default. This pages through
 * everything, and throws (instead of silently returning nothing) on an API error.
 */
function qboQueryAll(entity, where, accessToken, realmId) {
  var options = {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' }
  };
  var all = [];
  var start = 1;
  var PAGE = 1000;
  while (true) {
    var q = 'SELECT * FROM ' + entity + (where ? ' WHERE ' + where : '') +
            ' STARTPOSITION ' + start + ' MAXRESULTS ' + PAGE;
    var resp = UrlFetchApp.fetch(PRODUCTION_API_URL + realmId +
      '/query?minorversion=' + QBO_MINOR_VERSION + '&query=' + encodeURIComponent(q), options);
    if (resp.getResponseCode() !== 200) {
      Logger.log(entity + ' query failed: ' + resp.getContentText());
      throw new Error(entity + ' query failed (HTTP ' + resp.getResponseCode() + '). See Execution Logs.');
    }
    var rows = (JSON.parse(resp.getContentText()).QueryResponse || {})[entity] || [];
    all = all.concat(rows);
    if (rows.length < PAGE) return all;
    start += PAGE;
  }
}

/** Parses 'YYYY-MM-DD' into a real Date (so Sheets formulas can use it). */
function parseYmd_(s) {
  var p = String(s).split('T')[0].split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/**
 * FIX: real paid dates. Returns { DocNumber: Date } for invoices that QBO shows
 * fully paid, using the date of the Payment applied to them. Falls back to the
 * invoice's last-updated date only if no linked payment is found (e.g. paid by
 * credit memo or journal entry).
 */
function buildPaidMap_(accessToken, realmId, sinceDate) {
  var paidInvoices = qboQueryAll('Invoice',
    "Balance = '0.00' AND MetaData.LastUpdatedTime >= '" + sinceDate + "'", accessToken, realmId);

  var idToDoc = {};
  var paidMap = {};
  paidInvoices.forEach(function (inv) {
    idToDoc[inv.Id] = String(inv.DocNumber);
    paidMap[String(inv.DocNumber)] = inv.MetaData.LastUpdatedTime.split('T')[0]; // fallback
  });

  var payments = qboQueryAll('Payment', "TxnDate >= '" + sinceDate + "'", accessToken, realmId);
  var best = {};
  payments.forEach(function (p) {
    (p.Line || []).forEach(function (line) {
      (line.LinkedTxn || []).forEach(function (lt) {
        var doc = lt.TxnType === 'Invoice' ? idToDoc[lt.TxnId] : null;
        if (doc && (!best[doc] || p.TxnDate > best[doc])) best[doc] = p.TxnDate;
      });
    });
  });
  for (var d in best) paidMap[d] = best[d];

  for (var k in paidMap) paidMap[k] = parseYmd_(paidMap[k]);
  return paidMap;
}

/** Doc Number → open balance, from the last pull on the Invoices tab. */
function getOpenBalancesFromInvoicesTab_(ss) {
  var sheet = ss.getSheetByName(INVOICES_TAB);
  var map = {};
  if (!sheet) return map;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var doc = String(data[i][1]).trim();
    var bal = Number(data[i][6]);
    if (doc && !isNaN(bal)) map[doc] = bal;
  }
  return map;
}

/* =========================================================================
 * STEP 1: PULL INVOICES
 * ========================================================================= */

/**
 * Queries QuickBooks for open Invoices AND Credit Memos and writes them to the Invoices tab.
 */
function fetchInvoices() {
  var ui = SpreadsheetApp.getUi();
  var accessToken = getValidAccessToken();
  if (!accessToken) {
    ui.alert('App is not authorized or tokens expired. Please click "QuickBooks Integration" > "Authorize App".');
    return;
  }
  var realmId = PropertiesService.getScriptProperties().getProperty('REALM_ID');

  try {
    var invoices = qboQueryAll('Invoice', "Balance > '0.00'", accessToken, realmId);
    var creditMemos = qboQueryAll('CreditMemo', "Balance > '0.00'", accessToken, realmId);

    // Tag Credit Memos and make their balances negative to offset the totals
    creditMemos.forEach(function (cm) {
      cm.DocNumber = (cm.DocNumber || 'CM') + ' (Credit)';
      cm.DueDate = cm.DueDate || cm.TxnDate;
      cm.TotalAmt = -(cm.TotalAmt || 0);
      cm.Balance = -(cm.Balance || 0);
    });

    populateInvoicesToSheet(invoices.concat(creditMemos));
    ui.alert('Sync Successful!\n\nPulled ' + invoices.length + ' Invoices and ' + creditMemos.length + ' Credit Memos.');
  } catch (err) {
    ui.alert('QuickBooks pull failed: ' + err.message);
  }
}

/**
 * Writes invoice data, sorted and grouped by customer, with a grand total row.
 */
function populateInvoicesToSheet(invoices) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INVOICES_TAB) || ss.insertSheet(INVOICES_TAB);

  var dataRows = invoices.map(function (inv) {
    return [
      inv.Id || '',
      inv.DocNumber || '',
      inv.CustomerRef ? inv.CustomerRef.name : '',
      inv.TxnDate || '',
      inv.DueDate || '',
      inv.TotalAmt || 0,
      inv.Balance || 0
    ];
  });

  // Customer -> Doc Number -> Due Date
  dataRows.sort(function (a, b) {
    if (a[2] < b[2]) return -1;
    if (a[2] > b[2]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    if (a[4] < b[4]) return -1;
    if (a[4] > b[4]) return 1;
    return 0;
  });

  var outputData = [['Invoice ID', 'Doc Number', 'Customer Ref', 'Txn Date', 'Due Date', 'Total Amount', 'Balance']]
    .concat(dataRows);
  var lastDataRow = outputData.length;
  var totalRow = lastDataRow + 1;

  if (dataRows.length > 0) {
    outputData.push(['', '', '', '', 'GRAND TOTAL:', '=SUM(F2:F' + lastDataRow + ')', '=SUM(G2:G' + lastDataRow + ')']);
  }

  sheet.clearFormats();
  sheet.clearConditionalFormatRules();
  sheet.getBandings().forEach(function (b) { b.remove(); });

  sheet.getRange(1, 1, outputData.length, 7).setValues(outputData);
  if (sheet.getMaxRows() > outputData.length) {
    sheet.getRange(outputData.length + 1, 1, sheet.getMaxRows() - outputData.length, sheet.getMaxColumns()).clear();
  }

  if (dataRows.length === 0) return;

  sheet.getRange(2, 1, lastDataRow - 1, 7).setFontSize(10);
  sheet.getRange(1, 1, 1, 7)
    .setFontWeight('bold')
    .setBackground('#d9ead3')
    .setFontColor('black')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setBorder(false, false, true, false, false, false, 'black', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setFrozenRows(1);

  sheet.getRange(2, 6, totalRow - 1, 2).setNumberFormat('$#,##0.00');
  sheet.getRange(2, 4, lastDataRow - 1, 2).setHorizontalAlignment('center');
  sheet.getRange(2, 3, lastDataRow - 1, 1).setFontWeight('bold');

  sheet.getRange(totalRow, 1, 1, 7).setFontWeight('bold').setBackground('white').setFontColor('black').setFontSize(14);
  sheet.getRange(totalRow, 5).setHorizontalAlignment('right');

  for (var i = 1; i < dataRows.length; i++) {
    if (dataRows[i][2] !== dataRows[i - 1][2]) {
      sheet.getRange(i + 2, 1, 1, 7).setBorder(true, false, false, false, false, false, 'black', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  }
  sheet.getRange(totalRow, 1, 1, 7).setBorder(true, false, true, false, false, false, 'black', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Overdue highlight on Due Date
  var overdueRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(E2<>"", E2<TODAY())')
    .setBackground('#d9ead3')
    .setFontColor('#000000')
    .setRanges([sheet.getRange('E2:E' + lastDataRow)])
    .build();
  sheet.setConditionalFormatRules([overdueRule]);

  sheet.autoResizeColumns(1, 7);
}

/* =========================================================================
 * TABLE 1 HELPERS (CEO VIEW)
 * ========================================================================= */

/**
 * FIX: finds exactly where Table 1's data starts and ends, so later steps
 * never touch anything below it (e.g. a "3. CUSTOMER RATING CHANGES" table).
 */
function getTable1Bounds_(sheet) {
  var title = sheet.createTextFinder(TABLE1_TITLE).matchEntireCell(false).findNext();
  if (!title) return null;

  var headerRow = title.getRow() + 1;
  var firstRow = headerRow + 1;
  var lastRow = firstRow - 1;
  var maxRow = sheet.getLastRow();

  if (maxRow >= firstRow) {
    var colA = sheet.getRange(firstRow, 1, maxRow - firstRow + 1, 1).getValues();
    for (var r = 0; r < colA.length; r++) {
      var v = String(colA[r][0]).trim();
      if (v === '' || v.indexOf('CUSTOMER RATING') > -1) break;
      lastRow = firstRow + r;
    }
  }
  return { headerRow: headerRow, firstRow: firstRow, lastRow: lastRow, numRows: lastRow - firstRow + 1 };
}

/**
 * FIX: sorts all 12 columns (A–L). The old sort only covered A–K, so Actual
 * Paid Dates in column L stayed put while the rows around them moved.
 */
function sortTable1_(sheet) {
  var t = getTable1Bounds_(sheet);
  if (t && t.numRows > 1) {
    sheet.getRange(t.firstRow, 1, t.numRows, CEO_COLS).sort({ column: 4, ascending: true });
  }
}

/* =========================================================================
 * STEP 2: LOAD NEW INVOICES
 * ========================================================================= */

function loadNewInvoicesToWeeklyReport() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = ss.getSheetByName(INVOICES_TAB);
  var weeklySheet = ss.getSheetByName(CEO_TAB);

  if (!rawSheet || !weeklySheet) {
    ui.alert('Missing tabs. Make sure you have "' + INVOICES_TAB + '" and "' + CEO_TAB + '".');
    return;
  }
  var t = getTable1Bounds_(weeklySheet);
  if (!t) {
    ui.alert('Could not find Table 1. Make sure it contains "' + TABLE1_TITLE + '".');
    return;
  }

  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + 14);
  cutoffDate.setHours(23, 59, 59, 999);

  var rawData = rawSheet.getDataRange().getValues();
  if (rawData.length <= 1) {
    ui.alert('The Invoices tab is empty. Run "1. Pull Invoices from QBO" first.');
    return;
  }

  var existing = {};
  if (t.numRows > 0) {
    weeklySheet.getRange(t.firstRow, 1, t.numRows, 1).getValues().forEach(function (r) {
      existing[String(r[0]).trim()] = true;
    });
  }

  var newRows = [];
  for (var i = 1; i < rawData.length; i++) {
    var docNumber = String(rawData[i][1]).trim();
    var customer = rawData[i][2];
    var dueDate = rawData[i][4];
    var balance = rawData[i][6];
    var isWithin14Days = (dueDate instanceof Date) && (dueDate <= cutoffDate); // includes past due

    if (balance > MIN_BALANCE && docNumber !== '' && !existing[docNumber] && isWithin14Days) {
      newRows.push([docNumber, customer, balance, dueDate]);
      existing[docNumber] = true;
    }
  }

  if (newRows.length === 0) {
    sortTable1_(weeklySheet);
    ui.alert('No new invoices to add. Everything due in the next 14 days (or past due) is already on the CEO View.');
    return;
  }

  // FIX: insert all new rows at once at the BOTTOM of the table, so they copy a
  // data row's formatting instead of the header row's, then sort once.
  var insertAfter = t.numRows > 0 ? t.lastRow : t.headerRow;
  var n = newRows.length;
  weeklySheet.insertRowsAfter(insertAfter, n);
  var start = insertAfter + 1;

  weeklySheet.getRange(start, 1, n, CEO_COLS)
    .clearDataValidations()
    .setBackground(null)
    .setFontColor('#000000')
    .setFontWeight('normal')
    .setWrap(true)
    .setVerticalAlignment('middle');

  weeklySheet.getRange(start, 1, n, 4).setValues(newRows);
  weeklySheet.getRange(start, 3, n, 1).setNumberFormat('$#,##0');
  weeklySheet.getRange(start, 4, n, 1).setNumberFormat('M/d/yyyy');

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_LIST, true).setAllowInvalid(false).build();
  weeklySheet.getRange(start, 6, n, 1).setDataValidation(statusRule);

  var riskFormulas = [];
  var termsFormulas = [];
  for (var k = 0; k < n; k++) {
    var row = start + k;
    riskFormulas.push(['=IFERROR(VLOOKUP(B' + row + ', \'' + SCORECARD_TAB + '\'!A:H, 7, FALSE), "No History")']);
    termsFormulas.push(['=IFERROR(VLOOKUP(B' + row + ', \'' + SCORECARD_TAB + '\'!A:H, 8, FALSE), "Standard Terms")']);
  }
  weeklySheet.getRange(start, 9, n, 1).setFormulas(riskFormulas);
  weeklySheet.getRange(start, 11, n, 1).setFormulas(termsFormulas);

  sortTable1_(weeklySheet);

  ui.alert('Success! Added ' + n + ' new open invoice' + (n === 1 ? '' : 's') + ' to Table 1.');
}

/* =========================================================================
 * STEP 3: SYNC PAID DATES
 * ========================================================================= */

/**
 * Checks QBO for fully-paid invoices, sets Status to "Paid" and writes the
 * real payment date into column L.
 */
function syncPaidDatesFromQBO() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CEO_TAB);
  var t = sheet ? getTable1Bounds_(sheet) : null;
  if (!t || t.numRows === 0) {
    ui.alert('No active invoices to check.');
    return;
  }

  var accessToken = getValidAccessToken();
  if (!accessToken) {
    ui.alert('Token expired. Please authorize QBO.');
    return;
  }
  var realmId = PropertiesService.getScriptProperties().getProperty('REALM_ID');

  try {
    var since = new Date();
    since.setDate(since.getDate() - 60);
    var sinceStr = Utilities.formatDate(since, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var paidMap = buildPaidMap_(accessToken, realmId, sinceStr);

    var data = sheet.getRange(t.firstRow, 1, t.numRows, CEO_COLS).getValues();
    var statuses = data.map(function (r) { return [r[5]]; });
    var dates = data.map(function (r) { return [r[11]]; });

    var matchCount = 0;
    var unconfirmed = [];

    for (var i = 0; i < data.length; i++) {
      var doc = String(data[i][0]).replace(' (Credit)', '').trim();
      var paidDate = paidMap[doc];
      if (paidDate) {
        if (statuses[i][0] !== 'Paid' || !dates[i][0]) {
          statuses[i][0] = 'Paid';
          if (!dates[i][0]) dates[i][0] = paidDate;
          matchCount++;
        }
      } else if (statuses[i][0] === 'Paid') {
        unconfirmed.push(doc);
      }
    }

    sheet.getRange(t.firstRow, 6, t.numRows, 1).setValues(statuses);
    var dateRange = sheet.getRange(t.firstRow, 12, t.numRows, 1);
    dateRange.setValues(dates);
    dateRange.setNumberFormat('M/d/yyyy');

    for (var j = 0; j < statuses.length; j++) {
      if (statuses[j][0] === 'Paid') {
        sheet.getRange(t.firstRow + j, 1, 1, CEO_COLS).setBackground('#d9ead3');
      }
    }

    var msg = 'Payment Sync Complete!\n\nFound ' + matchCount + ' newly paid invoice' + (matchCount === 1 ? '' : 's') + '.';
    if (unconfirmed.length) {
      msg += '\n\nWARNING: ' + unconfirmed.length + ' row(s) are marked "Paid" but QuickBooks does NOT show them paid: ' +
             unconfirmed.join(', ') + '.\nRecord the payment in QuickBooks (and apply it to the invoice) before archiving.';
    }
    ui.alert(msg);
  } catch (e) {
    ui.alert('Error syncing payments: ' + e.message);
  }
}

/* =========================================================================
 * STEP 4: ARCHIVE
 * ========================================================================= */

/**
 * Moves "Paid" rows from Table 1 to the top of the Master AR Log (row 3).
 *
 * FIX: a row is only archived when
 *   - it has an Actual Paid Date in column L, and
 *   - QuickBooks (last pull on the Invoices tab) no longer shows a balance on it.
 * FIX: an invoice that is already in the Master AR Log is updated in place
 *      instead of being added a second time.
 */
function closeOutLastWeek() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ceoSheet = ss.getSheetByName(CEO_TAB);
  var masterSheet = ss.getSheetByName(MASTER_TAB);
  if (!ceoSheet || !masterSheet) {
    ui.alert('Missing "' + CEO_TAB + '" or "' + MASTER_TAB + '" tab.');
    return;
  }

  var t = getTable1Bounds_(ceoSheet);
  if (!t || t.numRows === 0) {
    ui.alert('No active invoices to archive.');
    return;
  }

  var openBalances = getOpenBalancesFromInvoicesTab_(ss);
  var data = ceoSheet.getRange(t.firstRow, 1, t.numRows, CEO_COLS).getValues();

  // Doc Number -> row number in the Master AR Log
  var masterIndex = {};
  var masterLast = masterSheet.getLastRow();
  if (masterLast >= 2) {
    masterSheet.getRange(2, 1, masterLast - 1, 1).getValues().forEach(function (r, idx) {
      var d = String(r[0]).trim();
      if (d) masterIndex[d] = idx + 2;
    });
  }

  var inserted = 0;
  var updated = 0;
  var skippedNoDate = [];
  var skippedOpen = [];

  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][5] !== 'Paid') continue;
    var doc = String(data[i][0]).trim();

    if (!data[i][11]) {
      skippedNoDate.push(doc);
      continue;
    }
    if (openBalances[doc] > MIN_BALANCE) {
      skippedOpen.push(doc + ' ($' + openBalances[doc].toFixed(2) + ' still open)');
      continue;
    }

    var rowVals = [
      data[i][0],  // A Invoice
      data[i][1],  // B Customer
      data[i][2],  // C Amount
      data[i][3],  // D Due Date
      data[i][4],  // E Promised / Expected Date
      data[i][5],  // F Status
      data[i][6],  // G Last Contact
      data[i][7],  // H Next Touchpoint
      data[i][8],  // I Risk
      data[i][9],  // J Risk Note
      data[i][11]  // K Actual Paid Date (from CEO col L)
    ];

    if (masterIndex[doc]) {
      masterSheet.getRange(masterIndex[doc], 1, 1, 11).setValues([rowVals]);
      updated++;
    } else {
      masterSheet.insertRowBefore(3);
      for (var key in masterIndex) {
        if (masterIndex[key] >= 3) masterIndex[key]++;
      }
      masterSheet.getRange(3, 1, 1, 11).setValues([rowVals]);
      masterIndex[doc] = 3;
      inserted++;
    }

    ceoSheet.deleteRow(t.firstRow + i);
  }

  var msg;
  if (inserted + updated > 0) {
    msg = 'Archive Complete!\n\nMoved ' + inserted + ' paid invoice(s) to the Master AR Log' +
          (updated ? ' and updated ' + updated + ' that were already there' : '') + '.';
  } else {
    msg = 'Nothing archived.';
  }
  if (skippedNoDate.length) {
    msg += '\n\nSkipped (marked Paid but no Actual Paid Date in column L — run step 3, or enter the date): ' +
           skippedNoDate.join(', ');
  }
  if (skippedOpen.length) {
    msg += '\n\nSkipped (QuickBooks still shows a balance — record the payment in QBO, then re-run steps 1 and 3): ' +
           skippedOpen.join(', ');
  }
  ui.alert(msg);
}

/* =========================================================================
 * AUDIT (read-only except for highlighting)
 * ========================================================================= */

/**
 * Highlights problem rows in the Master AR Log. Deletes nothing.
 *   Light red    = marked Paid, but QuickBooks still shows a balance on it
 *   Light yellow = the same invoice appears more than once
 */
function auditMasterARLog() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(MASTER_TAB);
  if (!master || master.getLastRow() < 2) {
    ui.alert('Master AR Log is empty.');
    return;
  }

  var openBalances = getOpenBalancesFromInvoicesTab_(ss);
  var last = master.getLastRow();
  var data = master.getRange(2, 1, last - 1, 11).getValues();

  var counts = {};
  data.forEach(function (r) {
    var d = String(r[0]).trim();
    if (d) counts[d] = (counts[d] || 0) + 1;
  });

  var backgrounds = [];
  var dupRows = 0;
  var openRows = 0;
  var openTotal = 0;
  var openDocs = {};

  data.forEach(function (r) {
    var d = String(r[0]).trim();
    var color = null;
    if (d && counts[d] > 1) { color = '#fff2cc'; dupRows++; }
    if (d && openBalances[d] > MIN_BALANCE) {
      color = '#f4cccc';
      openRows++;
      if (!openDocs[d]) { openDocs[d] = true; openTotal += openBalances[d]; }
    }
    var rowColors = [];
    for (var c = 0; c < 11; c++) rowColors.push(color);
    backgrounds.push(rowColors);
  });

  master.getRange(2, 1, data.length, 11).setBackgrounds(backgrounds);

  ui.alert('Master AR Log Audit',
    'Light RED rows: ' + openRows + ' row(s) logged as Paid but QuickBooks still shows them open ' +
    '(' + Object.keys(openDocs).length + ' invoices, $' + openTotal.toFixed(2) + ' outstanding).\n\n' +
    'Light YELLOW rows: ' + dupRows + ' row(s) belong to invoices logged more than once.\n\n' +
    'Nothing was deleted. These rows feed the Customer Payment Reliability Scorecard, so review and ' +
    'remove the bad ones by hand. Based on the Invoices tab — run step 1 first for current balances.',
    ui.ButtonSet.OK);
}

/* =========================================================================
 * DASHBOARD HEADER
 * ========================================================================= */

/**
 * Rebuilds the 6-row scorecard header above Table 1 (title row 7, headers row 8, data row 9+).
 *
 * FIX: formulas start at row 8 (the header row) instead of whole columns, so the
 *      tile values themselves can't be mistaken for dates.
 * FIX: "Expected This Week" uses the Due Date when no Expected Pay Date is entered,
 *      and leaves out rows already marked Paid.
 */
function buildModernCEODashboardHeader() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CEO_TAB);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Missing "' + CEO_TAB + '" tab.');
    return;
  }

  var table1Header = sheet.createTextFinder(TABLE1_TITLE).matchEntireCell(false).findNext();
  if (table1Header && table1Header.getRow() > 1) {
    sheet.deleteRows(1, table1Header.getRow() - 1);
  }

  sheet.insertRowsBefore(1, 6);
  sheet.setRowHeight(1, 15);
  sheet.setRowHeight(2, 20);
  sheet.setRowHeight(3, 36);
  sheet.setRowHeight(4, 12);
  sheet.setRowHeight(5, 20);
  sheet.setRowHeight(6, 36);

  function createScorecardTile(labelCell, numberCell, rangeStr, labelText, formula) {
    sheet.getRange(labelCell).setValue(labelText)
      .setFontSize(10).setFontColor('#FFFFFF').setFontWeight('normal').setHorizontalAlignment('center');
    sheet.getRange(numberCell).setFormula(formula)
      .setFontSize(18).setFontWeight('bold').setFontColor('#000000').setHorizontalAlignment('center')
      .setNumberFormat('$#,##0');
    sheet.getRange(rangeStr).setBackground('#93C47D')
      .setBorder(true, true, true, true, false, false, '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_THICK);
  }

  var WK = '(TODAY()-WEEKDAY(TODAY())+1)'; // this week's Sunday
  var M = "'" + MASTER_TAB + "'!";

  // Expected pay date in this week, OR no expected date and due this week. Excludes Paid.
  var expectedThisWeek =
    '=SUMIFS(C8:C, F8:F, "<>Paid", E8:E, ">="&' + WK + ', E8:E, "<="&' + WK + '+6)' +
    '+SUMIFS(C8:C, F8:F, "<>Paid", E8:E, "", D8:D, ">="&' + WK + ', D8:D, "<="&' + WK + '+6)';

  var confirmedThisWeek =
    '=SUMIFS(C8:C, F8:F, "<>Paid", I8:I, "🟢", E8:E, ">="&' + WK + ', E8:E, "<="&' + WK + '+6)' +
    '+SUMIFS(C8:C, F8:F, "<>Paid", I8:I, "🟢", E8:E, "", D8:D, ">="&' + WK + ', D8:D, "<="&' + WK + '+6)';

  var lastWeekPromised =
    '=SUMIFS(C8:C, E8:E, ">="&' + WK + '-7, E8:E, "<="&' + WK + '-1)' +
    '+SUMIFS(' + M + 'C2:C, ' + M + 'E2:E, ">="&' + WK + '-7, ' + M + 'E2:E, "<="&' + WK + '-1)';

  var collectedLastWeek =
    '=SUMIFS(' + M + 'C2:C, ' + M + 'K2:K, ">="&' + WK + '-7, ' + M + 'K2:K, "<="&' + WK + '-1)';

  sheet.getRange('A2:C2').merge(); sheet.getRange('A3:C3').merge();
  createScorecardTile('A2', 'A3', 'A2:C3', 'Expected This Week', expectedThisWeek);

  sheet.getRange('E2:G2').merge(); sheet.getRange('E3:G3').merge();
  createScorecardTile('E2', 'E3', 'E2:G3', 'Confirmed (🟢)', confirmedThisWeek);

  sheet.getRange('I2:K2').merge(); sheet.getRange('I3:K3').merge();
  createScorecardTile('I2', 'I3', 'I2:K3', 'At Risk (🟡 + 🔴)', '=A3-E3');

  sheet.getRange('A5:C5').merge(); sheet.getRange('A6:C6').merge();
  createScorecardTile('A5', 'A6', 'A5:C6', 'Last Week Promised', lastWeekPromised);

  sheet.getRange('E5:G5').merge(); sheet.getRange('E6:G6').merge();
  createScorecardTile('E5', 'E6', 'E5:G6', 'Collected Last Week', collectedLastWeek);

  sheet.getRange('I5:K5').merge(); sheet.getRange('I6:K6').merge();
  createScorecardTile('I5', 'I6', 'I5:K6', 'Variance', '=A6-E6');

  sheet.getRange('A2:K6').setVerticalAlignment('middle');

  SpreadsheetApp.getUi().alert('Dashboard header rebuilt with live formulas.');
}

/* =========================================================================
 * OPTIONAL UTILITIES (not on the menu)
 * ========================================================================= */

/**
 * Generates Table 3: "CUSTOMER RATING CHANGES" below Table 1.
 * FIX: ratings on the Scorecard are emoji (🟢 🟡 🔴), not the words Green/Amber/Red.
 */
function updateCustomerRatingChanges() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ceoSheet = ss.getSheetByName(CEO_TAB);
  var scoreSheet = ss.getSheetByName(SCORECARD_TAB);
  if (!ceoSheet || !scoreSheet) return;

  var GREEN = '🟢', AMBER = '🟡', RED = '🔴';

  var scoreData = scoreSheet.getDataRange().getValues();
  var liveRatings = {};
  for (var i = 1; i < scoreData.length; i++) {
    var customer = String(scoreData[i][0]).trim();
    if (customer) {
      liveRatings[customer] = {
        rating: scoreData[i][6],
        missed: scoreData[i][3],
        reliability: Number(scoreData[i][4]) || 0
      };
    }
  }

  var table3Header = ceoSheet.createTextFinder('3. CUSTOMER RATING CHANGES').matchEntireCell(false).findNext();
  var startRow;
  var existingData = [];

  if (table3Header) {
    startRow = table3Header.getRow();
    var lastRow = ceoSheet.getLastRow();
    if (lastRow > startRow + 1) {
      existingData = ceoSheet.getRange(startRow + 2, 1, lastRow - (startRow + 1), 4).getValues();
    }
    ceoSheet.getRange(startRow, 1, 200, 15).clearContent().clearFormat().clearDataValidations();
  } else {
    var t = getTable1Bounds_(ceoSheet);
    startRow = (t ? Math.max(t.lastRow, t.headerRow) : ceoSheet.getLastRow()) + 5;
  }

  var previousRatings = {};
  existingData.forEach(function (r) {
    var c = String(r[0]).trim();
    if (c) previousRatings[c] = r[2];
  });

  var outputData = [];
  for (var key in liveRatings) {
    var currentRating = liveRatings[key].rating;
    var pastRating = previousRatings[key] || GREEN;
    if (currentRating !== pastRating || currentRating === RED || currentRating === AMBER) {
      var relPercent = (liveRatings[key].reliability * 100).toFixed(0) + '%';
      var reason = 'Missed ' + liveRatings[key].missed + ' promises. Reliability at ' + relPercent + '.';
      if (currentRating !== pastRating) {
        reason = 'Rating shifted from ' + pastRating + ' to ' + currentRating + '. ' + reason;
      }
      outputData.push([key, pastRating, currentRating, reason]);
    }
  }

  ceoSheet.getRange(startRow, 1).setValue('3. CUSTOMER RATING CHANGES').setFontWeight('bold').setFontSize(11);
  ceoSheet.getRange(startRow + 1, 1, 1, 4)
    .setValues([['Customer', 'Previous Rating', 'New Rating', 'Reason for Change']])
    .setFontWeight('bold').setBackground('#1C4587').setFontColor('white');

  if (outputData.length > 0) {
    ceoSheet.getRange(startRow + 2, 1, outputData.length, 4).setValues(outputData);
    var rule = SpreadsheetApp.newDataValidation().requireValueInList([GREEN, AMBER, RED]).build();
    ceoSheet.getRange(startRow + 2, 2, outputData.length, 1).setDataValidation(rule);
    ceoSheet.getRange(startRow + 2, 1, outputData.length, 4).setVerticalAlignment('middle').setWrap(true);
    ceoSheet.getRange(startRow + 1, 1, outputData.length + 1, 4)
      .setBorder(true, true, true, true, true, true, 'black', SpreadsheetApp.BorderStyle.SOLID);
  } else {
    ceoSheet.getRange(startRow + 2, 1).setValue('No rating changes this week.');
  }
}

/** Re-applies the Status dropdown to every row of Table 1. */
function updateStatusDropdowns() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CEO_TAB);
  var t = getTable1Bounds_(sheet);
  if (!t || t.numRows === 0) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_LIST, true).setAllowInvalid(false).build();
  sheet.getRange(t.firstRow, 6, t.numRows, 1).setDataValidation(rule);
  SpreadsheetApp.getUi().alert('Status dropdown applied to all Table 1 rows.');
}

function showSupportModal() {
  SpreadsheetApp.getUi().alert(
    'QuickBooks App Support',
    'For technical support, contact support@yourcompany.com.\n\nTo reconnect your account, choose "Reset Connection / Logout".',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function logMyRedirectUri() {
  Logger.log('COPY THIS EXACT URL: ' + getRedirectUri());
}

function showMyExactRedirectUri() {
  var url = getRedirectUri();
  Logger.log('=== EXACT REDIRECT URI ===');
  Logger.log(url);
  SpreadsheetApp.getUi().alert('Copy this exact URI:\n\n' + url);
}
