/**
 * StalkingStocks — Google Sheets stock tracker builder.
 *
 * Builds a "Tracker" tab (and a "Config" tab holding the ticker universe)
 * inside whichever spreadsheet this script is bound to. Safe to re-run: it
 * rebuilds those two tabs and leaves every other tab alone.
 *
 * HOW TO RUN
 *   1. Open your Google Sheet
 *   2. Extensions -> Apps Script
 *   3. Delete whatever is in the editor, paste this whole file, Save
 *   4. Pick buildStockTracker from the function dropdown, click Run
 *   5. Authorise when prompted (it only touches this spreadsheet)
 *
 * Prices come from GOOGLEFINANCE and refresh on Google's own schedule
 * (roughly every 15-20 min for quotes). Nothing here calls an external API,
 * so there is no key to manage and nothing to keep running.
 */

// ---- What to track -------------------------------------------------------
// Google Finance symbols. NSE:<SYMBOL> for Indian equities and ETFs,
// BSE:<CODE> for BSE, or plain exchange prefixes like NASDAQ:AAPL.
var TICKERS = [
  'NSE:RELIANCE',
  'NSE:TCS',
  'NSE:HDFCBANK',
  'NSE:INFY',
  'NSE:ICICIBANK',
  'NSE:BHARTIARTL',
  'NSE:ITC',
  'NSE:LT',
  'NSE:SBIN',
  'NSE:HINDUNILVR',
  'NSE:GOLDBEES',
];

// Swap to '#,##0.00' if you track non-INR tickers.
var MONEY = '₹#,##0.00';

// Pulled from the site's light theme so the sheet matches the Memo tab.
var C = {
  up: '#1f8a44',
  down: '#b5361f',
  accent: '#c85a2a',
  text: '#211c14',
  muted: '#746c5c',
  panelSoft: '#f6f1e7',
  border: '#e6ddc9',
  bandA: '#ffffff',
  bandB: '#faf7f0',
};

var HEADERS = [
  'Ticker', 'Company', 'Price', 'Prev Close', 'Change', 'Change %',
  'Day Range', '52W Low', '52W High', '50-DMA', '% off High',
  'Range Position', '30D Trend', '1Y Trend', 'vs 50-DMA', 'Volume', 'Updated',
];

function buildStockTracker() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var n = TICKERS.length;

  var cfg = resetSheet_(ss, 'Config');
  writeConfig_(cfg);

  var sh = resetSheet_(ss, 'Tracker');
  sh.activate();

  // ---- Header row --------------------------------------------------------
  var head = sh.getRange(1, 1, 1, HEADERS.length);
  head.setValues([HEADERS])
    .setFontWeight('bold')
    .setFontSize(10)
    .setFontColor(C.accent)
    .setBackground(C.panelSoft)
    .setVerticalAlignment('middle')
    .setBorder(null, null, true, null, null, null, C.border, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(1, 34);

  // ---- Tickers -----------------------------------------------------------
  sh.getRange(2, 1, n, 1)
    .setValues(TICKERS.map(function (t) { return [t]; }))
    .setFontFamily('Roboto Mono')
    .setFontColor(C.text);

  // ---- Formulas ----------------------------------------------------------
  var rows = [];
  for (var i = 0; i < n; i++) rows.push(rowFormulas_(i + 2));
  sh.getRange(2, 2, n, HEADERS.length - 1).setFormulas(rows);

  // ---- Number formats ----------------------------------------------------
  sh.getRange(2, 3, n, 2).setNumberFormat(MONEY);                       // C:D
  sh.getRange(2, 5, n, 1).setNumberFormat('+' + MONEY + ';-' + MONEY);  // E
  sh.getRange(2, 6, n, 1).setNumberFormat('0.00%');                     // F
  sh.getRange(2, 8, n, 3).setNumberFormat(MONEY);                       // H:J
  sh.getRange(2, 11, n, 1).setNumberFormat('0.00%');                    // K
  sh.getRange(2, 16, n, 1).setNumberFormat('#,##0');                    // P
  sh.getRange(2, 17, n, 1).setNumberFormat('dd MMM, HH:mm');            // Q
  sh.getRange(2, 3, n, HEADERS.length - 2).setHorizontalAlignment('right');
  sh.getRange(2, 7, n, 1).setHorizontalAlignment('center');             // G
  sh.getRange(2, 15, n, 1).setHorizontalAlignment('center');            // O

  // ---- Layout ------------------------------------------------------------
  var widths = [130, 190, 95, 95, 90, 90, 125, 95, 95, 95, 90, 110, 110, 130, 95, 100, 120];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
  sh.setRowHeights(2, n, 30);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  var data = sh.getRange(2, 1, n, HEADERS.length);
  var banding = data.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  banding.setFirstRowColor(C.bandA).setSecondRowColor(C.bandB);

  // ---- Conditional formatting -------------------------------------------
  var rules = [];

  // Change % — green when up, red when down.
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2<>"",$F2>0)')
    .setFontColor(C.up).setBold(true)
    .setRanges([sh.getRange(2, 5, n, 2)])  // E:F together
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2<>"",$F2<0)')
    .setFontColor(C.down).setBold(true)
    .setRanges([sh.getRange(2, 5, n, 2)])
    .build());

  // % off high — deeper drawdown shades redder.
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#e8b4a8', SpreadsheetApp.InterpolationType.NUMBER, '-0.40')
    .setGradientMaxpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setRanges([sh.getRange(2, 11, n, 1)])
    .build());

  // Trend flag.
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Above').setFontColor(C.up).setBold(true)
    .setRanges([sh.getRange(2, 15, n, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Below').setFontColor(C.down).setBold(true)
    .setRanges([sh.getRange(2, 15, n, 1)]).build());

  // Stale row — nothing traded in over a day.
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",ISNUMBER($Q2),NOW()-$Q2>1)')
    .setFontColor(C.muted).setItalic(true)
    .setRanges([sh.getRange(2, 1, n, 2)])
    .build());

  sh.setConditionalFormatRules(rules);

  // ---- Ticker dropdown, sourced from Config ------------------------------
  var universe = cfg.getRange('A2:A' + (TICKERS.length + 1));
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(universe, true)
    .setAllowInvalid(true)   // you can still type a symbol that isn't listed
    .setHelpText('A Google Finance symbol, e.g. NSE:RELIANCE or NASDAQ:AAPL')
    .build();
  sh.getRange(2, 1, n, 1).setDataValidation(rule);

  SpreadsheetApp.flush();
  ss.toast('Tracker built with ' + n + ' tickers. Prices populate in a few seconds.', 'StalkingStocks', 8);
}

/**
 * One row of formulas, columns B..Q. Column H returns a 3-wide array that
 * spills into I and J, so those two are deliberately left blank.
 */
function rowFormulas_(r) {
  var hist = 'GOOGLEFINANCE($A' + r + ',"close",TODAY()-365,TODAY(),"DAILY")';
  var closes = 'QUERY(' + hist + ',"select Col2 offset 1",0)';

  return [
    // B Company
    '=IFERROR(GOOGLEFINANCE($A' + r + ',"name"),"—")',
    // C Price
    '=IFERROR(GOOGLEFINANCE($A' + r + ',"price"),"—")',
    // D Prev close
    '=IFERROR(GOOGLEFINANCE($A' + r + ',"closeyest"),"")',
    // E Change — falls back to arithmetic where the attribute is unsupported
    '=IFERROR(GOOGLEFINANCE($A' + r + ',"change"),IFERROR($C' + r + '-$D' + r + ',""))',
    // F Change % — changepct returns 1.23 meaning 1.23%, hence /100
    '=IFERROR(GOOGLEFINANCE($A' + r + ',"changepct")/100,IFERROR($C' + r + '/$D' + r + '-1,""))',
    // G Day range
    '=IFERROR(TEXT(GOOGLEFINANCE($A' + r + ',"low"),"0.00")&" – "&TEXT(GOOGLEFINANCE($A' + r + ',"high"),"0.00"),"—")',
    // H 52W low + I 52W high + J 50-DMA, from ONE history call.
    // high52/low52 are unreliable on NSE/BSE, so these are computed from
    // actual closes. SORT descending + ARRAY_CONSTRAIN(...,50,1) takes the
    // newest 50 closes for the moving average without a second call.
    '=IFERROR(LET(hist,' + closes + ',{MIN(hist),MAX(hist),AVERAGE(ARRAY_CONSTRAIN(SORT(hist,SEQUENCE(COUNT(hist)),FALSE),50,1))}),{"","",""})',
    '', // I — spill target
    '', // J — spill target
    // K % off 52W high
    '=IFERROR($C' + r + '/$I' + r + '-1,"")',
    // L Range position — one bar showing where price sits in the 52W range
    '=IFERROR(SPARKLINE(MAX(0,MIN(1,($C' + r + '-$H' + r + ')/($I' + r + '-$H' + r + '))),{"charttype","bar";"max",1;"color1","' + C.accent + '";"empty","zero"}),"")',
    // M 30-day line, coloured by the day's direction
    '=IFERROR(SPARKLINE(QUERY(GOOGLEFINANCE($A' + r + ',"close",TODAY()-30,TODAY(),"DAILY"),"select Col2 offset 1",0),{"charttype","line";"linewidth",2;"color",IF($F' + r + '>=0,"' + C.up + '","' + C.down + '");"empty","ignore";"nan","ignore"}),"")',
    // N 1-year weekly columns, high and low picked out
    '=IFERROR(SPARKLINE(QUERY(GOOGLEFINANCE($A' + r + ',"close",TODAY()-365,TODAY(),"WEEKLY"),"select Col2 offset 1",0),{"charttype","column";"color","#c6c2b6";"highcolor","' + C.up + '";"lowcolor","' + C.down + '";"empty","ignore";"nan","ignore"}),"")',
    // O vs 50-DMA
    '=IF(OR($C' + r + '="",$J' + r + '=""),"",IF($C' + r + '>$J' + r + ',"Above","Below"))',
    // P Volume
    '=IFERROR(GOOGLEFINANCE($A' + r + ',"volume"),"")',
    // Q Last trade time
    '=IFERROR(GOOGLEFINANCE($A' + r + ',"tradetime"),"")',
  ];
}

function writeConfig_(cfg) {
  cfg.getRange('A1').setValue('Ticker universe')
    .setFontWeight('bold').setFontColor(C.accent).setBackground(C.panelSoft);
  cfg.getRange(2, 1, TICKERS.length, 1)
    .setValues(TICKERS.map(function (t) { return [t]; }))
    .setFontFamily('Roboto Mono');
  cfg.setColumnWidth(1, 160);
  cfg.setColumnWidth(3, 520);

  cfg.getRange('C1').setValue('Notes')
    .setFontWeight('bold').setFontColor(C.accent).setBackground(C.panelSoft);
  var notes = [
    ['Add symbols to column A, then re-run buildStockTracker to rebuild the Tracker tab.'],
    ['Symbol format: NSE:RELIANCE, BSE:500325, NASDAQ:AAPL, NYSE:BRK.B'],
    ['GOOGLEFINANCE quotes are delayed up to ~20 minutes. Not for execution.'],
    ['pe / eps / marketcap / high52 are often unavailable on NSE and BSE.'],
    ['52W low, 52W high and the 50-DMA are computed from actual closes instead.'],
    ['Historical calls are the slow part. Past ~50 rows, expect Loading... and #N/A.'],
    ['A published (pubhtml) sheet refreshes on Google’s own cadence, around 5 min.'],
  ];
  cfg.getRange(2, 3, notes.length, 1).setValues(notes).setFontColor(C.muted).setWrap(true);
}

/** Clears a tab if it exists, creates it if it doesn't. Other tabs untouched. */
function resetSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return ss.insertSheet(name);
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
  return sh;
}
