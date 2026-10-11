// The Memo: short, dated editorial notes on how to read what's on this
// site — breadth, sector moves, earnings, methodology — not stock tips or
// buy/sell calls. Newest first. Each entry's `body` is a small block list:
// { p: "paragraph" } or { ul: ["item", "item"] }, rendered in order by
// memo-ui.js. `tags` are free-form and drive the filter strip.

const MEMOS = [
  {
    id: "reading-a-heatmap",
    date: "2026-10-10",
    title: "What a sector heatmap is actually telling you",
    dek: "Color on the heatmap is breadth, not conviction. A short note on what the tiles do and don't tell you before you act on them.",
    tags: ["How-to", "Markets"],
    body: [
      { p: "The Sector Heatmap on the Markets tab colors each sector by its average move for the day. It's useful for one thing: spotting where money is rotating in or out, fast. It is not a ranking of which sector is the better long-term holding — a sector can be bright green today and still be the worst performer over the last year." },
      { p: "Three things worth remembering before reading too much into a tile:" },
      { ul: [
        "A sector average hides dispersion — two or three large stocks can paint an entire tile green while most of its constituents are flat or red.",
        "One day of color is noise. Look for the same sector repeating across several sessions before treating it as a trend.",
        "Heatmap color and the Breadth strip above it answer different questions: the heatmap asks \"which group,\" breadth asks \"how many stocks, period.\" A green heatmap next to weak breadth usually means the gains are concentrated in a handful of names.",
      ] },
      { p: "If a tile catches your eye, the useful next step is the Stock Treemap on the Stocks tab, filtered to that sector — it breaks the average back down into the individual stocks that produced it." },
    ],
  },
  {
    id: "breadth-divergence-checklist",
    date: "2026-10-03",
    title: "Breadth diverging from price: a short checklist",
    dek: "When the index is up but the advance/decline line isn't confirming it, here's what's worth checking before drawing a conclusion.",
    tags: ["How-to", "Markets"],
    body: [
      { p: "Advance/decline breadth (the A/D strip under Markets) occasionally disagrees with the index: the headline number closes higher while more stocks fall than rise. That divergence gets talked about a lot and means less than the talk suggests, on its own." },
      { p: "Before treating a single day's divergence as a signal:" },
      { ul: [
        "Check how many sessions it's persisted. A one-day gap is routine; a multi-week stretch of weakening breadth under a rising index is the pattern people actually mean when they invoke this.",
        "Check whether the index itself is cap-weighted and whether a handful of large constituents can move it independently of the broader list — this is true of most of the indices tracked here.",
        "Check the coverage note under the breadth strip. A scan that only reached a fraction of the universe before timing out is read differently from a complete one.",
      ] },
      { p: "Breadth is a description of participation, not a prediction. It's one more piece of context next to price, not a standalone signal." },
    ],
  },
  {
    id: "earnings-past-the-headline",
    date: "2026-09-26",
    title: "Reading an earnings print past the headline number",
    dek: "A beat or a miss on EPS is the least interesting line in a results announcement. A short note on what to read next.",
    tags: ["How-to", "Earnings"],
    body: [
      { p: "Announcements (the tab) surfaces corporate filings as they land, and the first number most coverage leads with is whether EPS beat or missed an estimate. That comparison is sensitive to how conservative the estimate was to begin with, which is itself unobservable, so treat a beat or miss as a headline, not a verdict." },
      { p: "Three lines that tend to say more than the headline:" },
      { ul: [
        "Revenue growth versus volume growth — if revenue grew faster than volume, pricing did the work, which behaves differently across a cycle than volume growth does.",
        "Margin direction relative to the prior quarter, not just the prior year — year-over-year comparisons can hide a sequential deterioration that started a quarter or two earlier.",
        "Guidance language, where given — a reiterated range after a strong quarter is a different signal from a raised one.",
      ] },
      { p: "None of this replaces reading the actual filing. It's a starting filter for which paragraph of the results to read first." },
    ],
  },
  {
    id: "cyclicals-inventories-before-prices",
    date: "2026-09-19",
    title: "The quiet tell in cyclicals: inventories before prices",
    dek: "Metal, commodities, and other spread businesses usually show the turn in their working capital before it shows up in the headline price.",
    tags: ["Sectors"],
    body: [
      { p: "The Metal and Commodities sector pages both describe businesses that earn a spread: a selling price minus an input cost, multiplied by volume. In a business shaped like that, the realization price is the number everyone watches, but it's usually the last thing to move." },
      { p: "Ahead of a price turn, the earlier tells tend to show up in less-watched lines: builders and traders drawing down inventory instead of restocking, days of input cover shortening, or a producer letting utilization slip rather than carrying unsold volume. None of this is visible from a quote; it shows up in disclosures, trade data, and management commentary a quarter or two before the realization number itself moves." },
      { p: "It's a reason to read the \"Metrics to track\" section on a sector's page as a checklist for what to look for in filings, not just as a glossary." },
    ],
  },
  {
    id: "fund-rankings-are-mechanical",
    date: "2026-09-05",
    title: "Why the fund rankings here are mechanical, not advice",
    dek: "A note on what the Mutual Funds tab's ranking actually measures, and the ways past NAV performance can mislead.",
    tags: ["Methodology", "Funds"],
    body: [
      { p: "The Mutual Funds tab ranks Direct Plan, Growth-option equity funds against their category peers using nothing but historical NAV — a mechanical screen, stated plainly on the tab itself. It's worth spelling out what that means in practice." },
      { p: "A fund at the top of a ranking window got there through some combination of skill, sector tailwinds, and plain luck, in proportions this screen cannot separate. A few concrete ways that bites:" },
      { ul: [
        "A fund concentrated in one sector will rank well for as long as that sector runs and poorly the moment it doesn't — the NAV history doesn't disclose the concentration, only its effect.",
        "A short ranking window rewards recent momentum; a long one smooths it out but reacts slowly to a genuine change in strategy or manager.",
        "Survivorship isn't an issue within a single snapshot, but comparing today's ranking to an old screenshot can be, if underperforming funds were merged away in between.",
      ] },
      { p: "The ranking is a starting filter for which fund's actual portfolio and strategy to go read, not a conclusion about which one to hold." },
    ],
  },
];
