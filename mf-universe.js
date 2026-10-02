// Curated fund universe for each category. Each entry lists name phrases to try
// in order (funds get renamed, e.g. "SBI Bluechip" is now "SBI Large Cap").
// Each phrase is matched against mfapi.in scheme names; the Direct Plan - Growth
// option is chosen. Phrases that match nothing are reported as "unmatched" in
// the UI rather than guessed at.

const CATEGORIES = {
  large: {
    label: "Large Cap",
    // Names containing these words belong to other categories ("Large & Mid Cap" etc.)
    exclude: ["midcap", "smallcap", "mid", "small", "index", "etf", "fof", "nifty", "sensex"],
    funds: [
      ["Canara Robeco Bluechip Equity"],
      ["ICICI Prudential Bluechip"],
      ["Nippon India Large Cap"],
      ["SBI Large Cap", "SBI Bluechip"],
      ["DSP Large Cap", "DSP Top 100 Equity"],
      ["HDFC Large Cap", "HDFC Top 100"],
      ["Axis Large Cap", "Axis Bluechip"],
      ["Kotak Large Cap", "Kotak Bluechip"],
      ["Mirae Asset Large Cap"],
      ["Franklin India Large Cap", "Franklin India Bluechip"],
      ["Baroda BNP Paribas Large Cap"],
      ["Aditya Birla Sun Life Large Cap", "Aditya Birla Sun Life Frontline Equity"],
      ["UTI Large Cap", "UTI Mastershare"],
      ["Invesco India Largecap", "Invesco India Large Cap"],
      ["Tata Large Cap"],
      ["Bandhan Large Cap", "IDFC Large Cap"],
      ["Edelweiss Large Cap"],
      ["Sundaram Large Cap", "Sundaram Bluechip"],
      ["HSBC Large Cap"],
      ["LIC MF Large Cap"],
    ],
  },
  mid: {
    label: "Mid Cap",
    exclude: ["largecap", "large", "smallcap", "small", "index", "etf", "fof", "nifty"],
    funds: [
      ["HDFC Mid Cap Opportunities", "HDFC Mid Cap"],
      ["Kotak Emerging Equity", "Kotak Midcap"],
      ["Nippon India Growth Mid Cap", "Nippon India Growth"],
      ["Axis Midcap"],
      ["Mirae Asset Midcap"],
      ["DSP Midcap"],
      ["SBI Magnum Midcap", "SBI Midcap"],
      ["Motilal Oswal Midcap"],
      ["Invesco India Midcap"],
      ["Edelweiss Mid Cap"],
      ["Sundaram Mid Cap"],
      ["Franklin India Mid Cap", "Franklin India Prima"],
      ["ICICI Prudential Midcap"],
      ["Tata Mid Cap Growth", "Tata Mid Cap"],
      ["Aditya Birla Sun Life Midcap", "Aditya Birla Sun Life Mid Cap"],
      ["Quant Mid Cap"],
      ["PGIM India Midcap Opportunities"],
      ["Baroda BNP Paribas Mid Cap"],
      ["HSBC Midcap"],
      ["Bandhan Midcap", "Bandhan Mid Cap"],
    ],
  },
  small: {
    label: "Small Cap",
    exclude: ["largecap", "large", "midcap", "mid", "index", "etf", "fof", "nifty"],
    funds: [
      ["Nippon India Small Cap"],
      ["SBI Small Cap"],
      ["HDFC Small Cap"],
      ["Axis Small Cap"],
      ["Kotak Small Cap"],
      ["DSP Small Cap"],
      ["Quant Small Cap"],
      ["Franklin India Smaller Companies", "Franklin India Small Cap"],
      ["Tata Small Cap"],
      ["ICICI Prudential Smallcap"],
      ["Invesco India Smallcap"],
      ["Canara Robeco Small Cap"],
      ["Bandhan Small Cap"],
      ["HSBC Small Cap"],
      ["Edelweiss Small Cap"],
      ["Sundaram Small Cap"],
      ["Aditya Birla Sun Life Small Cap"],
      ["Motilal Oswal Small Cap"],
      ["Union Small Cap"],
      ["ITI Small Cap"],
    ],
  },
};

module.exports = { CATEGORIES };
