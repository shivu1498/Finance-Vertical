// NSE index catalogue, taken from the four niftyindices.com category printouts
// (Broad Based, Sectoral, Strategy, Thematic). The printouts were cut off
// ("1/3", "2/3" with the last pages missing), so later entries may be missing:
// add them to INDEX_NAMES below and they appear automatically.

const INDEX_FAMILIES = {
  broad: {
    label: "Broad Based",
    url: "https://www.niftyindices.com/indices/equity/broad-based-indices",
    blurb: "Large, liquid stocks listed on the Exchange. They serve as benchmarks for measuring the performance of stocks or portfolios such as mutual fund investments.",
  },
  sectoral: {
    label: "Sectoral",
    url: "https://www.niftyindices.com/indices/equity/sectoral-indices",
    blurb: "Track the companies of one sector of the economy, such as banks, IT or pharma.",
  },
  strategy: {
    label: "Strategy",
    url: "https://www.niftyindices.com/indices/equity/strategy-indices",
    blurb: "Built on quantitative models or investment strategies (momentum, quality, low volatility, equal weight and so on) to give a single value for the aggregate performance of a set of companies.",
  },
  thematic: {
    label: "Thematic",
    url: "https://www.niftyindices.com/indices/equity/thematic-indices",
    blurb: "Track companies linked to a theme such as defence, consumption, ESG or a corporate group, often across several sectors.",
  },
};

const INDEX_NAMES = {
  broad: [
    "Nifty 50", "Nifty Next 50", "Nifty 100", "Nifty Next 100", "Nifty 200", "Nifty Total Market", "Nifty 500",
    "Nifty500 Multicap 50:25:25", "Nifty500 LargeMidSmall Equal-Cap Weighted", "Nifty Midcap150", "Nifty Midcap 50",
    "Nifty Midcap Select", "Nifty Midcap 100", "Nifty Smallcap 500", "Nifty Smallcap 250", "Nifty Smallcap 50",
    "Nifty Smallcap 100", "Nifty Microcap 250", "Nifty LargeMidcap 250", "Nifty MidSmallcap 400",
    "Nifty MidSmallcap400 50:50", "Nifty India FPI 150",
  ],
  sectoral: [
    "Nifty Auto", "Nifty Bank", "Nifty Capital Goods", "Nifty Cement", "Nifty Chemicals",
    "Nifty Commercial & Transport Services", "Nifty Construction", "Nifty Consumer Durables", "Nifty Consumer Services",
    "Nifty Financial Services", "Nifty Financial Services 25/50", "Nifty Financial Services Ex Bank", "Nifty FMCG",
    "Nifty Healthcare", "Nifty Hospitals", "Nifty Housing Finance", "Nifty Insurance", "Nifty IT", "Nifty Media",
    "Nifty Metal", "Nifty NBFC", "Nifty Oil and Gas", "Nifty Pharma", "Nifty Power", "Nifty Private Bank",
    "Nifty PSU Bank", "Nifty Realty",
  ],
  strategy: [
    "Nifty100 Equal Weight", "Nifty100 Low Volatility 30", "Nifty 50 Arbitrage", "Nifty 50 Futures PR",
    "Nifty 50 Futures TR", "Nifty200 Momentum 30", "Nifty200 Alpha 30", "Nifty100 Alpha 30", "Nifty Alpha 50",
    "Nifty Alpha Low Volatility 30", "Nifty Alpha Quality Low Volatility 30", "Nifty Alpha Quality Value Low Volatility 30",
    "Nifty Dividend Opportunities 50", "Nifty High Dividend Yield 15", "Nifty Growth Sectors 15", "Nifty High Beta 50",
    "Nifty Low Volatility 50", "Nifty Top 10 Equal Weight", "Nifty Top 15 Equal Weight", "Nifty Top 20 Equal Weight",
    "Nifty100 Quality 30", "Nifty Midcap150 Momentum 50", "Nifty500 Flexicap Quality 30", "Nifty500 Growth 50",
    "Nifty500 Low Volatility 50", "Nifty500 Momentum 50", "Nifty500 Quality 50", "Nifty500 Multifactor MQVLv 50",
    "Nifty Midcap150 Quality 50", "Nifty Smallcap250 Quality 50", "Nifty Total Market Momentum Quality 50",
    "Nifty500 Multicap Momentum Quality 50", "Nifty MidSmallcap400 Momentum Quality 100",
    "Nifty Smallcap250 Momentum Quality 100", "Nifty Quality Low Volatility 30", "Nifty50 Dividend Points",
    "Nifty50 Equal Weight", "Nifty50 USD", "Nifty50 PR 1x Inverse", "Nifty50 PR 2x Leverage", "Nifty50 TR 1x Inverse",
    "Nifty50 TR 2x Leverage", "Nifty50 Value 20", "Nifty200 Value 30", "Nifty500 Value 50", "Nifty500 Equal Weight",
    "Nifty200 Quality 30", "Nifty50 & Short Duration Debt – Dynamic P/B", "Nifty50 & Short Duration Debt – Dynamic P/E",
    "Nifty Equity Savings",
  ],
  thematic: [
    "Nifty AI Catalysts", "Nifty India Corporate Group Index - Aditya Birla Group", "Nifty Capital Markets",
    "Nifty Commodities", "Nifty Conglomerate 50", "Nifty Core Housing", "Nifty CPSE", "Nifty Energy",
    "Nifty EV & New Age Automotive", "Nifty Housing", "Nifty100 ESG", "Nifty100 Enhanced ESG",
    "Nifty100 ESG Sector Leaders", "Nifty India Consumption", "Nifty India Defence", "Nifty India Defence Equal Weight",
    "Nifty India Digital", "Nifty India Infrastructure & Logistics", "Nifty India Internet", "Nifty India Manufacturing",
    "Nifty India New Age Consumption", "Nifty India Railways PSU", "Nifty India Tourism",
    "Nifty India Select 5 Corporate Groups (MAATR)", "Nifty Infrastructure",
    "Nifty India Corporate Group Index - Mahindra Group", "Nifty IPO", "Nifty Midcap Liquid 15",
    "Nifty MidSmall India Consumption", "Nifty MNC", "Nifty Mobility", "Nifty PSE", "Nifty REITs & InvITs",
    "Nifty REITs & InvITs 90:10", "Nifty Rural", "Nifty Non-Cyclical Consumer", "Nifty Services Sector",
    "Nifty Shariah 25", "Nifty Small Finance Banks & Microfinance Institutions", "Nifty Sugar & Ethanol",
    "Nifty India Corporate Group Index - Tata Group", "Nifty India Corporate Group Index - Tata Group 25% Cap",
    "Nifty Transportation & Logistics", "Nifty100 Liquid 15", "Nifty50 Shariah", "Nifty500 Shariah",
    "Nifty500 Multicap India Manufacturing 50:30:20", "Nifty500 Multicap Infrastructure 50:30:20", "Nifty500 Ahimsa",
    "Nifty SME Emerge", "Nifty Waves",
  ],
};

// Yahoo Finance symbols for the indices that Yahoo is known to carry. These
// could not be tested from the build sandbox; a symbol that does not resolve
// simply shows "—". Everything else has no free live feed here.
const INDEX_LIVE = {
  "Nifty 50": "^NSEI", "Nifty Next 50": "^NSMIDCP", "Nifty 100": "^CNX100", "Nifty 200": "^CNX200",
  "Nifty 500": "^CRSLDX", "Nifty Midcap 50": "^NSEMDCP50",
  "Nifty Auto": "^CNXAUTO", "Nifty Bank": "^NSEBANK", "Nifty Financial Services": "^CNXFIN", "Nifty FMCG": "^CNXFMCG",
  "Nifty IT": "^CNXIT", "Nifty Media": "^CNXMEDIA", "Nifty Metal": "^CNXMETAL", "Nifty Pharma": "^CNXPHARMA",
  "Nifty PSU Bank": "^CNXPSUBANK", "Nifty Realty": "^CNXREALTY",
  "Nifty Commodities": "^CNXCMDT", "Nifty Energy": "^CNXENERGY", "Nifty Infrastructure": "^CNXINFRA",
  "Nifty India Consumption": "^CNXCONSUM", "Nifty MNC": "^CNXMNC", "Nifty PSE": "^CNXPSE", "Nifty Services Sector": "^CNXSERVICE",
};

// Index -> Sector Knowledge page (knowledge.js ids), only where the match is clear.
const INDEX_RESEARCH = {
  "Nifty Auto": "auto", "Nifty Bank": "bank", "Nifty Capital Goods": "infra", "Nifty Cement": "commodities",
  "Nifty Chemicals": "commodities", "Nifty Commercial & Transport Services": "services", "Nifty Construction": "infra",
  "Nifty Consumer Durables": "cons-durables", "Nifty Consumer Services": "services", "Nifty Financial Services": "fin-services",
  "Nifty Financial Services 25/50": "fin-services", "Nifty Financial Services Ex Bank": "fin-services", "Nifty FMCG": "fmcg",
  "Nifty Healthcare": "healthcare", "Nifty Hospitals": "healthcare", "Nifty Housing Finance": "fin-services",
  "Nifty Insurance": "fin-services", "Nifty IT": "it", "Nifty Media": "media", "Nifty Metal": "metal",
  "Nifty NBFC": "fin-services", "Nifty Oil and Gas": "oil-gas", "Nifty Pharma": "pharma", "Nifty Power": "energy",
  "Nifty Private Bank": "pvt-bank", "Nifty PSU Bank": "psu-banks", "Nifty Realty": "realty",
  "Nifty Capital Markets": "capital-mkts", "Nifty Commodities": "commodities", "Nifty Energy": "energy",
  "Nifty MNC": "mnc", "Nifty Services Sector": "services", "Nifty Infrastructure": "infra",
  "Nifty Small Finance Banks & Microfinance Institutions": "fin-services", "Nifty EV & New Age Automotive": "auto",
};

// Tags are derived from the index name so the catalogue can be filtered by style.
const INDEX_TAG_RULES = [
  ["Factor", /momentum|quality|low volatility|value|alpha|growth|high beta|dividend|multifactor/i],
  ["Equal weight", /equal[- ]weight|equal-cap/i],
  ["Leveraged / inverse", /leverage|inverse/i],
  ["Futures / hybrid", /futures|arbitrage|short duration debt|equity savings/i],
  ["ESG / ethical", /esg|shariah|ahimsa/i],
  ["Corporate group", /corporate group|maatr|conglomerate/i],
  ["PSU", /psu|cpse|\bpse\b/i],
];

const NSE_INDICES = Object.entries(INDEX_NAMES).flatMap(([family, names]) =>
  names.map((name) => ({
    name,
    family,
    symbol: INDEX_LIVE[name] || null,
    research: INDEX_RESEARCH[name] || null,
    tags: INDEX_TAG_RULES.filter(([, re]) => re.test(name)).map(([tag]) => tag),
  }))
);
