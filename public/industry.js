// Builds the NSE industry tree from industry-data.js and classifies stocks.
// Depends on industry-data.js, data.js (NIFTY50) and knowledge.js (K_SECTORS).

const NSE_IND = (() => {
  const LEVELS = [
    ["mes", "Macro-Economic Sector", 0],
    ["sec", "Sector", 4],
    ["ind", "Industry", 6],
    ["bas", "Basic Industry", 8],
  ];
  const byCode = new Map();
  const byName = { mes: new Map(), sec: new Map(), ind: new Map(), bas: new Map() };
  const lists = {};

  for (const [level] of LEVELS) {
    lists[level] = NSE_INDUSTRY_RAW[level].map(([code, name, definition]) => {
      const node = { level, code, name, definition: definition || "", children: [], parent: null };
      byCode.set(code, node);
      byName[level].set(name, node);
      return node;
    });
  }
  // A code starts with its parent's code: IN01 > IN0101 > IN010101 > IN010101001.
  const parentLen = { sec: 4, ind: 6, bas: 8 };
  for (const level of ["sec", "ind", "bas"]) {
    for (const node of lists[level]) {
      const parent = byCode.get(node.code.slice(0, parentLen[level]));
      node.parent = parent;
      parent.children.push(node);
    }
  }
  const path = (node) => {
    const p = [];
    for (let n = node; n; n = n.parent) p.unshift(n);
    return p;
  };
  return { levels: LEVELS, lists, byCode, byName, path };
})();

// Basic industry (NSE name) for each Nifty 50 stock. This is my mapping from
// the document's definitions and NSE's published constituents; check it
// against NSE if you rely on it.
const STOCK_BASIC = {
  ADANIENT: "Trading - Minerals", ADANIPORTS: "Port & Port services", APOLLOHOSP: "Hospital", ASIANPAINT: "Paints",
  AXISBANK: "Private Sector Bank", "BAJAJ-AUTO": "2/3 Wheelers", BAJFINANCE: "Non Banking Financial Company (NBFC)",
  BAJAJFINSV: "Holding Company", BEL: "Aerospace & Defense", BHARTIARTL: "Telecom - Cellular & Fixed line services",
  CIPLA: "Pharmaceuticals", COALINDIA: "Coal", DRREDDY: "Pharmaceuticals", EICHERMOT: "2/3 Wheelers",
  GRASIM: "Cement & Cement Products", HCLTECH: "Computers - Software & Consulting", HDFCBANK: "Private Sector Bank",
  HDFCLIFE: "Life Insurance", HEROMOTOCO: "2/3 Wheelers", HINDALCO: "Aluminium", HINDUNILVR: "Diversified FMCG",
  ICICIBANK: "Private Sector Bank", INDUSINDBK: "Private Sector Bank", INFY: "Computers - Software & Consulting",
  ITC: "Diversified FMCG", JSWSTEEL: "Iron & Steel", KOTAKBANK: "Private Sector Bank", LT: "Civil Construction",
  "M&M": "Passenger Cars & Utility Vehicles", MARUTI: "Passenger Cars & Utility Vehicles", NESTLEIND: "Packaged Foods",
  NTPC: "Power Generation", ONGC: "Oil Exploration & Production", POWERGRID: "Power - Transmission",
  RELIANCE: "Refineries & Marketing", SBILIFE: "Life Insurance", SBIN: "Public Sector Bank",
  SHRIRAMFIN: "Non Banking Financial Company (NBFC)", SUNPHARMA: "Pharmaceuticals", TATACONSUM: "Tea & Coffee",
  TATAMOTORS: "Passenger Cars & Utility Vehicles", TATASTEEL: "Iron & Steel",
  TCS: "Computers - Software & Consulting", TECHM: "Computers - Software & Consulting", TITAN: "Gems, Jewellery And Watches",
  TRENT: "Speciality Retail", ULTRACEMCO: "Cement & Cement Products", WIPRO: "Computers - Software & Consulting",
};

// Stocks per classification node (any level), built by walking each stock's path.
const NSE_STOCKS_BY_NODE = (() => {
  const map = new Map();
  for (const stock of NIFTY50) {
    const basic = NSE_IND.byName.bas.get(STOCK_BASIC[stock.name]);
    if (!basic) continue;
    for (const node of NSE_IND.path(basic)) {
      if (!map.has(node.code)) map.set(node.code, []);
      map.get(node.code).push(stock);
    }
  }
  return map;
})();

// Sector Knowledge page -> the NSE sectors/industries it corresponds to.
const KNOWLEDGE_NSE = {
  "capital-mkts": [["ind", "Capital Markets"]],
  metal: [["sec", "Metals & Mining"]],
  commodities: [["sec", "Chemicals"], ["sec", "Construction Materials"]],
  "fin-services": [["ind", "Finance"], ["ind", "Insurance"], ["ind", "Financial Technology (Fintech)"]],
  media: [["sec", "Media, Entertainment & Publication"]],
  "pvt-bank": [["bas", "Private Sector Bank"]],
  "oil-gas": [["sec", "Oil, Gas & Consumable Fuels"]],
  services: [["sec", "Services"], ["sec", "Telecommunication"], ["ind", "Retailing"]],
  bank: [["ind", "Banks"]],
  infra: [["sec", "Construction"], ["sec", "Capital Goods"], ["ind", "Transport Infrastructure"]],
  fmcg: [["sec", "Fast Moving Consumer Goods"]],
  energy: [["sec", "Power"], ["ind", "Consumable Fuels"]],
  "cons-durables": [["sec", "Consumer Durables"]],
  "psu-banks": [["bas", "Public Sector Bank"]],
  auto: [["sec", "Automobile and Auto Components"]],
  it: [["sec", "Information Technology"]],
  pharma: [["ind", "Pharmaceuticals & Biotechnology"]],
  healthcare: [["ind", "Healthcare Services"], ["ind", "Healthcare Equipment & Supplies"]],
  realty: [["sec", "Realty"]],
};
