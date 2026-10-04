// Company Knowledge: curated reading lists per company, mirrored from the
// "Knowledge Base -> Discussions & Analysis" section of each company's page on
// Tijori Finance (https://www.tijorifinance.com). Titles and author labels are
// Tijori's own; every link opens the original source in a new tab.
//
// To add a company: append an object to K_COMPANIES with the same shape.
// `url` is null only when no working link could be confirmed; the UI then
// falls back to the company's Tijori page.

const K_COMPANIES = [
  {
    id: "grasim",
    ticker: "GRASIM", // NSE ticker; connects this list to ticker lookups
    name: "Grasim Industries Ltd.",
    sector: "Diversified: cement, chemicals, textiles, paints",
    source: "https://www.tijorifinance.com/company/grasim-industries-limited/#knowledgebase",
    groups: [
      {
        title: "Grasim Industries Ltd.",
        links: [
          { title: "Grasim <> Spring Energy Analysis", by: "Zerodha Markets", url: "https://x.com/zerodhamarkets/status/2077615226527358986" },
          { title: "Nikhil Kamath x Kumar Birla | People by WTF", by: "Nikhil Kamath", url: "https://www.youtube.com/watch?v=e6FqC4pWy8I" },
          { title: "Report on Grasim and the upcoming paint foray.", by: "Chins", url: "https://twitter.com/Chins1729/status/1601237173000294400" },
          { title: "View the discussion on ValuePickr", by: "", url: "https://forum.valuepickr.com/t/grasim-industries-ltd-aditya-birla-nuvo-ltd-merger/6649" },
        ],
      },
      {
        title: "Building Materials",
        links: [
          { title: "Masterclass in Building Materials", by: "G2G Ajay", url: "https://www.youtube.com/watch?v=LrsBmqL4OLE" },
          { title: "Decoding Plastic Pipes industry in India", by: "PPFAS", url: "https://www.youtube.com/watch?v=mis-yvyf_jE" },
          { title: "Cement Fibre Products - Industry & the risks", by: "Anish Moonka", url: "https://twitter.com/AnishA_Moonka/status/1435922928223150081" },
          { title: "Tiles and Building Material Sector - An Overview", by: "PPFAS", url: "https://www.youtube.com/watch?v=tf30tjY9edw" },
        ],
      },
      {
        title: "Cement",
        links: [
          { title: "Is Cement the Hidden Hero of India's Growth Story?", by: "SOIC", url: null },
          { title: "VP Cyclicals 2.0: Cement Industry Key Issues & Cyclicality", by: "ValuePickr", url: "https://forum.valuepickr.com/t/vp-cyclicals-2-0-cement-industry-key-issues-cyclicality/28407" },
          { title: "The Basics: Cement Sector with Rakesh Arora (Hindi)", by: "Omkara Capital", url: "https://www.youtube.com/watch?v=Slt7IxMSt5E" },
          { title: "What Matters Most For Cement Companies", by: "Harshit Toshniwal", url: "https://twitter.com/Harshitt93/status/1581186282872786946" },
          { title: "Cement Sector Deep Dive!", by: "Harshit Toshniwal", url: "https://www.youtube.com/watch?v=y8l760uPUIE" },
          { title: "Cement Sector Overview - Hindi", by: "Varinder Bansal | Anil Singhvi", url: "https://www.youtube.com/watch?v=-O66l0kFu4s" },
          { title: "Cement Industry - Discussion Thread on Valuepickr Forum", by: "ValuePickr", url: "https://forum.valuepickr.com/t/vp-cyclicals-2-0-cement-industry-key-issues-cyclicality/28407" },
        ],
      },
      {
        title: "Paints & Coatings",
        links: [
          { title: "Can Birla Opus Win the Indian Paints War? — Documentary", by: "Zerodha Markets", url: "https://www.youtube.com/watch?v=9ID91U4keZk" },
          { title: "Twitter Thread: Paint Sector", by: "Kirtan A Shah", url: "https://twitter.com/KirtanShahCFP/status/1354967170439122952" },
          { title: "Overview of the Paints Sector", by: "PPFAS", url: "https://www.youtube.com/watch?v=9GKKa-blmlo" },
        ],
      },
      {
        title: "Textiles",
        links: [
          { title: "From Fiber to Fashion: Value chain, Brands & Tariffs", by: "PPFAS", url: "https://youtu.be/HA8BwgUTPz8" },
          { title: "Inside One of India's Largest Garment Factories", by: "Sarthak Ahuja", url: "https://www.youtube.com/watch?v=Ry_jT5uITiQ" },
          { title: "India Innerwear: Distribution Is Key", by: "MoneyWorks4Me", url: "https://www.moneyworks4me.com/investmentshastra/indian-innerwear-industry-distribution-is-key/" },
          { title: "CareEdge Webinar on Indian Ready-Made Garments", by: "CARE Ratings", url: "https://www.youtube.com/watch?v=rNittXSpZzM" },
          { title: "How to do Business Analysis of Textile Companies", by: "Dr Vijay Malik", url: "https://twitter.com/drvijaymalik/status/1509038568853110789" },
          { title: "CARE Ratings Webinar on Apparel Industry", by: "CARE Ratings", url: "https://www.youtube.com/watch?v=2cMdpbn8tv0" },
          { title: "Business Summary Of Textile Companies In One Slide", by: "Ankit (StocksandStoics)", url: "https://twitter.com/StocksAndStoics/status/1478096188326907904" },
          { title: "Textile Day - Thematic Webinar", by: "B&K Securities", url: "https://www.youtube.com/watch?v=pZYwfXJUTRA" },
        ],
      },
    ],
  },
];
