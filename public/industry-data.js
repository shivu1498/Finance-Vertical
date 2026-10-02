// NSE Indices Industry Classification Structure (July 2023), extracted from the official PDF.
// Four levels: Macro-Economic Sector (IN01) > Sector (IN0101) > Industry (IN010101) > Basic Industry (IN010101001).
// Each code starts with its parent's code. Rows are [code, name] and, for basic industries, [code, name, definition].
const NSE_INDUSTRY_RAW = {
 "mes": [
  [
   "IN01",
   "Commodities"
  ],
  [
   "IN02",
   "Consumer Discretionary"
  ],
  [
   "IN03",
   "Energy"
  ],
  [
   "IN04",
   "Fast Moving Consumer Goods"
  ],
  [
   "IN05",
   "Financial Services"
  ],
  [
   "IN06",
   "Healthcare"
  ],
  [
   "IN07",
   "Industrials"
  ],
  [
   "IN08",
   "Information Technology"
  ],
  [
   "IN09",
   "Services"
  ],
  [
   "IN10",
   "Telecommunication"
  ],
  [
   "IN11",
   "Utilities"
  ],
  [
   "IN12",
   "Diversified"
  ]
 ],
 "sec": [
  [
   "IN0101",
   "Chemicals"
  ],
  [
   "IN0102",
   "Construction Materials"
  ],
  [
   "IN0103",
   "Metals & Mining"
  ],
  [
   "IN0104",
   "Forest Materials"
  ],
  [
   "IN0201",
   "Automobile and Auto Components"
  ],
  [
   "IN0202",
   "Consumer Durables"
  ],
  [
   "IN0203",
   "Textiles"
  ],
  [
   "IN0204",
   "Media, Entertainment & Publication"
  ],
  [
   "IN0205",
   "Realty"
  ],
  [
   "IN0206",
   "Consumer Services"
  ],
  [
   "IN0301",
   "Oil, Gas & Consumable Fuels"
  ],
  [
   "IN0401",
   "Fast Moving Consumer Goods"
  ],
  [
   "IN0501",
   "Financial Services"
  ],
  [
   "IN0601",
   "Healthcare"
  ],
  [
   "IN0701",
   "Construction"
  ],
  [
   "IN0702",
   "Capital Goods"
  ],
  [
   "IN0801",
   "Information Technology"
  ],
  [
   "IN0901",
   "Services"
  ],
  [
   "IN1001",
   "Telecommunication"
  ],
  [
   "IN1101",
   "Power"
  ],
  [
   "IN1102",
   "Utilities"
  ],
  [
   "IN1201",
   "Diversified"
  ]
 ],
 "ind": [
  [
   "IN010101",
   "Chemicals & Petrochemicals"
  ],
  [
   "IN010102",
   "Fertilizers & Agrochemicals"
  ],
  [
   "IN010203",
   "Cement & Cement Products"
  ],
  [
   "IN010204",
   "Other Construction Materials"
  ],
  [
   "IN010301",
   "Ferrous Metals"
  ],
  [
   "IN010302",
   "Non - Ferrous Metals"
  ],
  [
   "IN010303",
   "Diversified Metals"
  ],
  [
   "IN010304",
   "Minerals & Mining"
  ],
  [
   "IN010305",
   "Metals & Minerals Trading"
  ],
  [
   "IN010401",
   "Paper, Forest & Jute Products"
  ],
  [
   "IN020101",
   "Automobiles"
  ],
  [
   "IN020102",
   "Auto Components"
  ],
  [
   "IN020201",
   "Consumer Durables"
  ],
  [
   "IN020301",
   "Textiles & Apparels"
  ],
  [
   "IN020401",
   "Media"
  ],
  [
   "IN020402",
   "Entertainment"
  ],
  [
   "IN020403",
   "Printing & Publication"
  ],
  [
   "IN020501",
   "Realty"
  ],
  [
   "IN020601",
   "Leisure Services"
  ],
  [
   "IN020602",
   "Other Consumer Services"
  ],
  [
   "IN020603",
   "Retailing"
  ],
  [
   "IN030101",
   "Gas"
  ],
  [
   "IN030102",
   "Oil"
  ],
  [
   "IN030103",
   "Petroleum Products"
  ],
  [
   "IN030104",
   "Consumable Fuels"
  ],
  [
   "IN040101",
   "Agricultural Food & other Products"
  ],
  [
   "IN040102",
   "Beverages"
  ],
  [
   "IN040103",
   "Cigarettes & Tobacco Products"
  ],
  [
   "IN040104",
   "Food Products"
  ],
  [
   "IN040105",
   "Personal Products"
  ],
  [
   "IN040106",
   "Household Products"
  ],
  [
   "IN040107",
   "Diversified FMCG"
  ],
  [
   "IN050101",
   "Finance"
  ],
  [
   "IN050102",
   "Banks"
  ],
  [
   "IN050103",
   "Capital Markets"
  ],
  [
   "IN050104",
   "Insurance"
  ],
  [
   "IN050105",
   "Financial Technology (Fintech)"
  ],
  [
   "IN060101",
   "Pharmaceuticals & Biotechnology"
  ],
  [
   "IN060102",
   "Healthcare Equipment & Supplies"
  ],
  [
   "IN060103",
   "Healthcare Services"
  ],
  [
   "IN070101",
   "Construction"
  ],
  [
   "IN070201",
   "Aerospace & Defense"
  ],
  [
   "IN070202",
   "Agricultural, Commercial & Construction Vehicles"
  ],
  [
   "IN070203",
   "Electrical Equipment"
  ],
  [
   "IN070204",
   "Industrial Manufacturing"
  ],
  [
   "IN070205",
   "Industrial Products"
  ],
  [
   "IN080101",
   "IT - Software"
  ],
  [
   "IN080102",
   "IT - Services"
  ],
  [
   "IN080103",
   "IT - Hardware"
  ],
  [
   "IN090101",
   "Engineering Services"
  ],
  [
   "IN090102",
   "Transport Services"
  ],
  [
   "IN090103",
   "Transport Infrastructure"
  ],
  [
   "IN090104",
   "Commercial Services & Supplies"
  ],
  [
   "IN090105",
   "Public Services"
  ],
  [
   "IN100101",
   "Telecom - Services"
  ],
  [
   "IN100102",
   "Telecom - Equipment & Accessories"
  ],
  [
   "IN110101",
   "Power"
  ],
  [
   "IN110201",
   "Other Utilities"
  ],
  [
   "IN120101",
   "Diversified"
  ]
 ],
 "bas": [
  [
   "IN010101001",
   "Commodity Chemicals",
   "Manufacturers of basic and industrial chemicals like synthetic fibres, films, organic and inorganic chemicals etc."
  ],
  [
   "IN010101002",
   "Specialty Chemicals",
   "Manufacturers of chemicals used in the manufacture of a variety of products, like fine chemicals, additives, advanced polymers, explosives, adhesives, printing inks, sealants, dyes, pigments, coatings etc."
  ],
  [
   "IN010101003",
   "Carbon Black",
   "Manufacturers of carbon black"
  ],
  [
   "IN010101004",
   "Dyes And Pigments",
   "Manufacturer, supplier and distributor of dyes and pigments"
  ],
  [
   "IN010101005",
   "Explosives",
   "Manufacturer, supplier and exporter of commercial explosives and explosive accessories"
  ],
  [
   "IN010101006",
   "Petrochemicals",
   "Manufacturer, supplier and distributor of petrochemical products like propylene oxide, propylene glycols and polyols etc. Also includes manufacturers of nylon, polyester and acrylic fibres, plastics (not covered under Plastic Products - Consumer under Consumer Discretionary and Plastic Products - Industrial under Manufacturing) etc."
  ],
  [
   "IN010101007",
   "Printing Inks",
   "Manufacturers and distributor of printing inks and allied material"
  ],
  [
   "IN010101008",
   "Trading - Chemicals",
   "Trading companies and distributors of chemicals"
  ],
  [
   "IN010101009",
   "Industrial Gases",
   "Producer or supplier of industrial gases"
  ],
  [
   "IN010102001",
   "Fertilizers",
   "Manufacturers of fertilizers"
  ],
  [
   "IN010102002",
   "Pesticides & Agrochemicals",
   "Manufacturers of agrochemicals and pesticides"
  ],
  [
   "IN010203001",
   "Cement & Cement Products",
   "Manufacturer, supplier and distributor of cement, cement products"
  ],
  [
   "IN010204001",
   "Other Construction Materials",
   "Other construction material such as supplier of sand etc. It excludes companies dealing with granites, marbles, etc. which are classified as separate basic industry under Consumer Discretionary"
  ],
  [
   "IN010301001",
   "Ferro & Silica Manganese",
   "Manufacturers and distributor of ferro silico manganese like ferro alloys, briquette, fly ash bricks etc."
  ],
  [
   "IN010301002",
   "Pig Iron",
   "Manufacturers and distributor of pig iron"
  ],
  [
   "IN010301003",
   "Sponge Iron",
   "Manufacturers and distributor of sponge iron"
  ],
  [
   "IN010301004",
   "Iron & Steel",
   "Manufacturers of Iron & steel"
  ],
  [
   "IN010302001",
   "Aluminium",
   "Mining, processing, manufacturing and distributing the aluminium"
  ],
  [
   "IN010302002",
   "Copper",
   "Producer and distributor of copper"
  ],
  [
   "IN010302003",
   "Zinc",
   "Producer and distributor of zinc"
  ],
  [
   "IN010302004",
   "Precious Metals",
   "Mining, manufacturing and distributing precious materials like gold, silver, platinum etc. Includes investment trusts where underlying is gold or similar precious metals"
  ],
  [
   "IN010303001",
   "Diversified Metals",
   "Companies engaged in manufacturing and mining of diversified metals"
  ],
  [
   "IN010304001",
   "Industrial Minerals",
   "Mining, producing and distributing industrial materials (excluding Coal which has been classified under 'Energy')"
  ],
  [
   "IN010305001",
   "Trading - Metals",
   "Trading companies and distributors of metals (excluding precious metals)"
  ],
  [
   "IN010305002",
   "Trading - Minerals",
   "Trading companies and distributors of industrial minerals (excluding Coal trading which has been classified under 'Energy')"
  ],
  [
   "IN010401001",
   "Paper & Paper Products",
   "Manufacturers of paper, paper boards etc."
  ],
  [
   "IN010401002",
   "Forest Products",
   "Companies dealing with Timber, Wood, Soil, Pulp, Firewood, Cork, Shellac, Cross Laminated Timber excluding plywood and laminates which is classified as 'Furniture, Home Furnishing, Flooring' under Consumer Discretionary"
  ],
  [
   "IN010401003",
   "Jute & Jute Products",
   "Manufacturers of jute and jute products"
  ],
  [
   "IN020101001",
   "Passenger Cars & Utility Vehicles",
   "Manufacturer of passenger /utility vehicles including car, bus, taxis, auto rickshaws etc."
  ],
  [
   "IN020101002",
   "2/3 Wheelers",
   "Manufacturers of motorcycles, scooters, three-wheelers (does not include bicycles and tricycles)"
  ],
  [
   "IN020101004",
   "Auto Dealer",
   "Trading and distribution of passenger cars, utility vehicles, 2/3 wheelers"
  ],
  [
   "IN020102001",
   "Auto Components & Equipments",
   "Manufacturers and distributors of accessories for automobiles, batteries, fasteners, gas cylinders for automobile etc."
  ],
  [
   "IN020102006",
   "Tyres & Rubber Products",
   "Manufacturers and distributors of tyres and rubber products for automobile"
  ],
  [
   "IN020102007",
   "Trading - Auto Components",
   "Trading and distribution of auto components"
  ],
  [
   "IN020201002",
   "Cycles",
   "Manufacturers and distributors of bicycles and tricycles"
  ],
  [
   "IN020201003",
   "Consumer Electronics",
   "Manufacturers and distributor of consumer electronics like television, video cassette recorder, DVD player, audio equipments, games etc."
  ],
  [
   "IN020201018",
   "Furniture, Home Furnishing",
   "Manufacturer/ distributor of furniture, carpets, curtains and other home furnishing products"
  ],
  [
   "IN020201019",
   "Ceramics",
   "Manufacturer/ distributor of floor and wall tiles"
  ],
  [
   "IN020201020",
   "Granites & Marbles",
   "Manufacturer/ distributor of granites and marbles"
  ],
  [
   "IN020201005",
   "Gems, Jewellery And Watches",
   "Manufacturers and distributor of gems, jewellery, watches and other luxury goods and accessories including companies engaged into cutting & polishing diamonds"
  ],
  [
   "IN020201006",
   "Glass - Consumer",
   "Manufacturers and distributor of consumer glass products"
  ],
  [
   "IN020201007",
   "Household Appliances",
   "Manufacturers of electric household appliances like air conditioners, juicers, food processors, microwave ovens etc."
  ],
  [
   "IN020201008",
   "Houseware",
   "Manufacturers and distributors of other household durable products like cookware, cutlery, utensils and consumer specialties not classified otherwise"
  ],
  [
   "IN020201009",
   "Leather And Leather Products",
   "Manufacturers and distributors of leather products such as belt, leather bags, all types of footwear etc."
  ],
  [
   "IN020201010",
   "Leisure Products",
   "Manufacturers of leisure products and equipment including sports equipment, gift articles, toys, games etc."
  ],
  [
   "IN020201011",
   "Plastic Products - Consumer",
   "Manufacturers and distributor of plastic products used in households such as suitcase, briefcase and other consumer plastic products not covered under 'Houseware' above"
  ],
  [
   "IN020201012",
   "Plywood Boards/ Laminates",
   "Manufacturers and distributor of plywood, laminates etc."
  ],
  [
   "IN020201013",
   "Sanitary Ware",
   "Manufacturer of sanitary ware like ceramic plumbing fixtures (as sinks, lavatories, or toilet bowls)"
  ],
  [
   "IN020201015",
   "Paints",
   "Manufacturers and distributors of interior and exterior paints"
  ],
  [
   "IN020201016",
   "Diversified consumer products",
   "Any other consumer products not covered above"
  ],
  [
   "IN020201017",
   "Footwear",
   "Companies engaged in manufacturing, trading and distribution of all types of footwear and related accessories"
  ],
  [
   "IN020301001",
   "Garments & Apparels",
   "Manufacturers & distributors of apparels/ garments, knitwears, innerwears etc."
  ],
  [
   "IN020301002",
   "Other Textile Products",
   "Manufacturers & distributors of textiles, fabrics, yarn, silk yarn, blended and texturized yarn and related products. Includes spinning of cotton/ synthetic/ other yarn and companies engaged in cotton ginning operations"
  ],
  [
   "IN020301003",
   "Trading - Textile Products",
   "Trading and Distribution of 'garments & apparels' and 'other textile products' where a revenue from each segment cannot be determined separately"
  ],
  [
   "IN020401001",
   "Advertising & Media Agencies",
   "Companies providing advertising, public relations and marketing services. It also includes billboard providers and telemarketers."
  ],
  [
   "IN020401002",
   "Electronic Media",
   "Publisher of newspapers, magazines and other periodicals through electronic medium"
  ],
  [
   "IN020401003",
   "Web based media and service",
   "Companies engaged in providing social media, search engines, platforms for networking etc. Excludes companies operating in online shopping classified under E-Retail/ E-Commerce and companies providing online directory of suppliers and potential buyers for various products/ merchandise classified under Internet & Catalogue Retail"
  ],
  [
   "IN020401004",
   "Print Media",
   "Publisher of newspapers, magazines and other periodicals through print medium"
  ],
  [
   "IN020402001",
   "Film Production, Distribution & Exhibition",
   "Producers and distributors of movies. Includes theatres and auditoriums"
  ],
  [
   "IN020402002",
   "Digital Entertainment",
   "Producers and distributors of movies and other entertainment related contents through digital, Over the Top (OTT) platform."
  ],
  [
   "IN020402003",
   "Media & Entertainment",
   "Producers and distributors of entertainment products and services. It includes companies engaged in the production, distribution and screening of television shows, producers and distributors of music and sports teams. It excludes production and distribution of movies which is classified under 'Film Production, Distribution & Exhibition'."
  ],
  [
   "IN020402004",
   "TV Broadcasting & Software Production",
   "Owners of TV channels, includes broadcasting of TV shows and cable TV operators and DTH service providers"
  ],
  [
   "IN020403001",
   "Printing & Publication",
   "Companies providing service of commercial printing, publication of books, commercial documents etc,"
  ],
  [
   "IN020501001",
   "Residential, Commercial Projects",
   "Companies engaged in development and construction of residential/ commercial (offices/shops etc.) properties"
  ],
  [
   "IN020501002",
   "Real Estate related services",
   "Companies engaged in providing real estate related services like real estate agents, real estate leasing, real estate data analytics etc."
  ],
  [
   "IN020501003",
   "Real Estate Investment Trusts (REITs)",
   "Companies or Trusts engaged in ownership, acquisition, development, management and operation of real estate"
  ],
  [
   "IN020601001",
   "Hotels & Resorts",
   "Owners and operators of hotels, resorts etc. Includes investment trusts where underlying is 'Hotels and Resorts'"
  ],
  [
   "IN020601002",
   "Restaurants",
   "Owners and operators of restaurants, recreation clubs, bars, coffee shops, fast- food, catering service etc."
  ],
  [
   "IN020601003",
   "Amusement Parks/ Other Recreation",
   "Owners and operators of amusement parks, Casinos and other recreation facilities not covered above"
  ],
  [
   "IN020601004",
   "Wellness",
   "Owners and operators of wellness facilities such as gymnasium, yoga centre, beauty parlours, salons etc."
  ],
  [
   "IN020601005",
   "Tour, Travel Related Services",
   "Companies engaged into provision of tour, travel related services. It includes tour operators, ticketing, visa processing, hotel and vehicle booking etc. It includes companies that provide such service through digital medium"
  ],
  [
   "IN020602001",
   "Education",
   "Any stream of education (including IT education or any specialized training) provided in classroom"
  ],
  [
   "IN020602002",
   "E-Learning",
   "Any stream of education (including IT education or any specialized training) provided through medium other than classroom"
  ],
  [
   "IN020602003",
   "Food Storage Facilities",
   "Companies engaged in providing food storage facility"
  ],
  [
   "IN020602004",
   "Other Consumer Services",
   "Companies providing other consumer services not classified elsewhere. It includes event managers, security services, housekeeping services etc."
  ],
  [
   "IN020603001",
   "Speciality Retail",
   "Owners and operators of retail store comprising a single class of goods such as apparels, electronics, stationary etc."
  ],
  [
   "IN020603002",
   "Pharmacy Retail",
   "Companies engaged in sale of pharmaceutical, provision of health related products and services through electronic medium"
  ],
  [
   "IN020603003",
   "Diversified Retail",
   "Owners and operators of stores offering multiple range of product categories (department stores)"
  ],
  [
   "IN020603004",
   "E-Retail/ E- Commerce",
   "Companies that earn significant revenue from provision of products or services predominantly through electronic medium such as internet."
  ],
  [
   "IN020603005",
   "Internet & Catalogue Retail",
   "Companies providing online directory of suppliers and potential buyers for various products/ merchandise"
  ],
  [
   "IN020603006",
   "Distributors",
   "Distributors and wholesalers of general merchandise not classified elsewhere"
  ],
  [
   "IN030101001",
   "Gas Transmission/Marketing",
   "Companies engaged in marketing and/ or transportation of gases"
  ],
  [
   "IN030101003",
   "LPG/CNG/PNG/LNG Supplier",
   "Companies engaged in distribution of LPG, CNG, PNG and LNG"
  ],
  [
   "IN030101004",
   "Trading - Gas",
   "Companies engaged in the activity of trading in gas"
  ],
  [
   "IN030102001",
   "Oil Exploration & Production",
   "Companies engaged in the exploration and production of oil"
  ],
  [
   "IN030102002",
   "Offshore Support Solution Drilling",
   "Companies providing offshore drilling services to oil companies"
  ],
  [
   "IN030102003",
   "Oil Storage & Transportation",
   "Companies engaged in providing storage and transportation facility for oil companies"
  ],
  [
   "IN030102004",
   "Oil Equipment & Services",
   "Manufacturers of equipment for and providers of services to the oil and gas industry"
  ],
  [
   "IN030103001",
   "Refineries & Marketing",
   "Companies engaged in the refining and marketing of oil, gas and petroleum products"
  ],
  [
   "IN030103002",
   "Lubricants",
   "Manufacturers and distributors of lubricants"
  ],
  [
   "IN030104001",
   "Coal",
   "Companies engaged in exploration, mining and distribution of coal, coke and lignite etc."
  ],
  [
   "IN030104002",
   "Trading - Coal",
   "Companies engaged in trading and distribution of coal, coke and lignite etc."
  ],
  [
   "IN040101001",
   "Edible Oil",
   "Producers and distributors of edible oil"
  ],
  [
   "IN040101002",
   "Sugar",
   "Producers and distributors of sugar and allied products"
  ],
  [
   "IN040101003",
   "Tea & Coffee",
   "Producers and distributors of tea and coffee"
  ],
  [
   "IN040101004",
   "Other Agricultural Products",
   "Producers and distributors of agricultural products not classified elsewhere"
  ],
  [
   "IN040102001",
   "Breweries & Distilleries",
   "Manufacturers of alcoholic beverages. Includes distillers"
  ],
  [
   "IN040102002",
   "Other Beverages",
   "Manufacturers of non-alcoholic beverages"
  ],
  [
   "IN040103001",
   "Cigarettes & Tobacco Products",
   "Manufacturers and distributors of cigarettes and other tobacco products"
  ],
  [
   "IN040104001",
   "Animal Feed",
   "Manufacturers and distributors of animal feed"
  ],
  [
   "IN040104002",
   "Dairy Products",
   "Producers and distributors of dairy products"
  ],
  [
   "IN040104003",
   "Other Food Products",
   "Producers and distributors of other food products not classified elsewhere"
  ],
  [
   "IN040104004",
   "Packaged Foods",
   "Producers & distributors of packaged foods including biscuits, chocolates, chips etc."
  ],
  [
   "IN040104005",
   "Seafood",
   "Culture and processors of fish, shrimp and other sea/ freshwater food"
  ],
  [
   "IN040104006",
   "Meat Products including Poultry",
   "Processors of meat and/ or breeders and processors of chicken and eggs"
  ],
  [
   "IN040105001",
   "Personal Care",
   "Manufacturers and distributors of personal products such as toothpaste, shampoo, perfume, cosmetics etc."
  ],
  [
   "IN040106001",
   "Household Products",
   "Manufacturers and distributors of household products such as aluminium foils, detergents, matchstick, paper tissues, soaps etc., manufacturers and distributors of batteries used in home appliances. Excludes automobiles batteries classified under 'Consumer Discretionary', manufacturers and distributors of photographic products"
  ],
  [
   "IN040106004",
   "Stationary",
   "Manufacturers and distributors of stationary such as pen, pencil, notebooks etc."
  ],
  [
   "IN040107001",
   "Diversified FMCG",
   "Companies engaged into multiple FMCG products, where no single business segment contributes more than 50% of companies' total revenue and two or more segments each contributes at least 20% of total revenue"
  ],
  [
   "IN050101001",
   "Financial Institution",
   "Financial Institutions as defined under Section 4(1) of the Companies Act, 1956"
  ],
  [
   "IN050101002",
   "Housing Finance Company",
   "Companies providing loan for buying housing and commercial properties"
  ],
  [
   "IN050101003",
   "Investment Company",
   "Companies which earn major revenue from interest, capital appreciation from investments made. It does not include rental income which is classified under 'Diversified Commercial Services'"
  ],
  [
   "IN050101004",
   "Non Banking Financial Company (NBFC)",
   "Non Banking Financial Company (NBFC) as may be specified by the Reserve Bank of India (RBI). It excludes companies classified under basic industry 'Microfinance Institutions'"
  ],
  [
   "IN050101005",
   "Other Financial Services",
   "Companies providing financial services not covered elsewhere under 'Financial Services'"
  ],
  [
   "IN050101006",
   "Holding Company",
   "Holding companies with holding of 51% or more in other company"
  ],
  [
   "IN050101007",
   "Microfinance Institutions",
   "Microfinance companies as may be specified by the Reserve Bank of India (RBI)."
  ],
  [
   "IN050101008",
   "Securitisation",
   "Trusts that issue pass-through certificates, which include asset-backed securities, mortgage-backed securities, corporate assets-backed securities, besides other securitisation transactions"
  ],
  [
   "IN050102001",
   "Public Sector Bank",
   "Banks sponsored by Central or State government in India categorized as public sector bank by Reserve Bank of India (RBI)"
  ],
  [
   "IN050102002",
   "Private Sector Bank",
   "Banks categorized as private sector banks by Reserve Bank of India (RBI)"
  ],
  [
   "IN050102003",
   "Other Bank",
   "Other banks not classified under Public Sector Bank and Private Sector Bank above. Includes foreign banks, payment banks, small banks etc."
  ],
  [
   "IN050103001",
   "Asset Management Company",
   "Companies engaged in mutual fund activities i.e. companies operating mutual funds, open-end mutual funds, closed-end mutual funds etc."
  ],
  [
   "IN050103002",
   "Depositories, Clearing Houses and Other Intermediaries",
   "Companies providing depository services. Includes clearing houses/ clearing corporations, registrar/ share transfer agents, custodians etc. which are not covered elsewhere under 'Capital Markets'"
  ],
  [
   "IN050103003",
   "Financial Products Distributor",
   "Companies engaged into distribution of financial products"
  ],
  [
   "IN050103004",
   "Ratings",
   "Companies providing ratings service"
  ],
  [
   "IN050103005",
   "Exchange and Data Platform",
   "Companies providing platform for trading of equity, commodity, currency, fixed income securities, power etc. are classified under 'Exchange Platform'. Companies providing data vending/ data dissemination are classified under 'Data Platform'"
  ],
  [
   "IN050103006",
   "Stockbroking & Allied",
   "Companies engaged in providing brokerage services and other allied activities such as investment advisory services etc."
  ],
  [
   "IN050103007",
   "Other Capital Market related Services",
   "Other Capital Market related Services not classified elsewhere above"
  ],
  [
   "IN050104001",
   "General Insurance",
   "Companies providing general insurance"
  ],
  [
   "IN050104002",
   "Life Insurance",
   "Companies providing life insurance"
  ],
  [
   "IN050104003",
   "Other Insurance Companies",
   "Insurance companies offering multiple line of insurance such as life insurance, general insurance, medical insurance, etc."
  ],
  [
   "IN050104004",
   "Insurance Distributors",
   "Companies engaged into distribution of insurance products"
  ],
  [
   "IN050105001",
   "Financial Technology (Fintech)",
   "Fintechs providing services like banking, payment processing, brokerage, aggregation and distribution of financial products and services"
  ],
  [
   "IN060101001",
   "Pharmaceuticals",
   "Manufacturers and distributors of pharmaceuticals and companies engaged in research & development of pharmaceuticals"
  ],
  [
   "IN060101002",
   "Biotechnology",
   "Companies engaged in the development, manufacturing or marketing and distribution of products based on biotechnology"
  ],
  [
   "IN060102001",
   "Medical Equipment & Supplies",
   "Manufacturers and distributors of medical equipments such as blood pressure monitoring machine, X-Ray machines, MRI scanners, and supplies such as injection needles, syringe, gloves etc."
  ],
  [
   "IN060103001",
   "Hospital",
   "Owners and operators of health care facilities. It includes hospitals, nursing homes and veterinary hospitals. Includes investment trusts where underlying is 'Hospitals'"
  ],
  [
   "IN060103002",
   "Healthcare Service Provider",
   "Owners and operators of diagnostic services such as pathological laboratories, X-Ray and MRI scan centres, etc."
  ],
  [
   "IN060103003",
   "Healthcare Research, Analytics & Technology",
   "Companies providing healthcare research and analytics related services"
  ],
  [
   "IN070101001",
   "Civil Construction",
   "Companies engaged in designing, construction and maintenance of roads, bridges, canals, dams etc. It also include companies engaged into Engineering, procurement and construction (EPC) projects. It excludes companies engaged in construction of residential and commercial buildings which are classified as 'Realty' under 'Consumer Discretionary'. Includes investment trusts where underlying is 'Civil Construction'"
  ],
  [
   "IN070201001",
   "Aerospace & Defense",
   "Manufacturers of civil and military aerospace and equipments, defense equipments, defense electronics and products thereof"
  ],
  [
   "IN070202001",
   "Tractors",
   "Manufacturers of tractors and other farm vehicles"
  ],
  [
   "IN070202002",
   "Commercial Vehicles",
   "Manufacturers of commercial vehicles as trucks, dumpers etc."
  ],
  [
   "IN070202003",
   "Construction Vehicles",
   "Manufacturers of construction vehicles like cranes, bulldozers etc."
  ],
  [
   "IN070202004",
   "Dealers– Commercial Vehicles, Tractors, Construction Vehicles",
   "Trading and distribution of either of commercial vehicles, tractors, construction vehicles and ancillary equipment"
  ],
  [
   "IN070203001",
   "Heavy Electrical Equipment",
   "Manufacturers and distributors of power generating equipment and other heavy electrical equipment such as power turbines, transmission towers, heavy electrical machinery"
  ],
  [
   "IN070203002",
   "Other Electrical Equipment",
   "Manufactures and distributors of electrical components or equipment not classified under Heavy Electrical Equipment"
  ],
  [
   "IN070204005",
   "Railway Wagons",
   "Manufacturers of railway wagons and EMU coaches"
  ],
  [
   "IN070204006",
   "Ship Building & Allied Services",
   "Companies engaged in ship building and providing allied services"
  ],
  [
   "IN070204008",
   "Industrial Products",
   "Manufacturers & distributor of industrial electronics like CC TV surveillance system, access control system, fire alarm system, multi-apartment video door phones, video door phones, intruder alarm system, fingerprint locks, and remote managed services etc. It includes manufacturers & distributor of industrial equipment, elevators, escalators etc. It also includes manufacturers & distributors of engineering and construction related products, industrial equipments, machinery & other industrial products"
  ],
  [
   "IN070205003",
   "Cables - Electricals",
   "Manufacturers and distributors of electrical cables/ wires. Excludes telecom cables which are classified as 'Telecom - Equipment & Accessories' under 'Telecommunication'"
  ],
  [
   "IN070205004",
   "Castings & Forgings",
   "Manufacturers and distributors of castings and forgings. Excludes companies generating majority revenue from automobile segment and they are classified as 'Auto Components & Equipments' classified under 'Consumer Discretionary'"
  ],
  [
   "IN070205008",
   "Packaging",
   "Manufacturers and distributors of packaging materials such as cardboard, bags, boxes, cans, drums, bottles and jars and glass"
  ],
  [
   "IN070205009",
   "Plastic Products - Industrial",
   "Manufacturers and distributors of industrial plastic products such as plastic pipes etc."
  ],
  [
   "IN070205011",
   "Rubber",
   "Manufacturers and distributors of rubber and rubber products. Excludes companies classified as 'Tyres & Rubber Products' under 'Consumer Discretionary'"
  ],
  [
   "IN070205012",
   "Other Industrial Products",
   "Manufacturers and distributors of other industrial products not classified elsewhere"
  ],
  [
   "IN070205013",
   "Glass - Industrial",
   "Manufacturers and distributors of industrial glasses. It excludes consumer glass classified under 'Consumer Discretionary'"
  ],
  [
   "IN070205014",
   "Aluminium, Copper & Zinc Products",
   "Manufacturers and distributors of aluminium, copper and zinc products"
  ],
  [
   "IN070205015",
   "Iron & Steel Products",
   "Manufacturers and distributors of iron and steel products"
  ],
  [
   "IN070205016",
   "Abrasives & Bearings",
   "Manufactures and distributors of abrasives and bearings. Excludes bearings used for automobiles which are classified as 'Auto Components & Equipments' under Consumer Discretionary"
  ],
  [
   "IN070205017",
   "Compressors, Pumps & Diesel Engines",
   "Manufacturers and distributors of compressors, diesel engines. Excludes engines used for automobiles which are classified as 'Auto Components & Equipments' under Consumer Discretionary"
  ],
  [
   "IN070205018",
   "Electrodes & Refractories",
   "Manufacturers and distributors of electrodes and refractories"
  ],
  [
   "IN080101001",
   "Computers - Software & Consulting",
   "Companies engaged in software development, IT consulting and data analytics"
  ],
  [
   "IN080101002",
   "Software Products",
   "Companies engaged in development of software products that can be commonly used by individuals and corporates"
  ],
  [
   "IN080102001",
   "IT Enabled Services",
   "Companies engaged in providing services for business automation through provision of IT infrastructure."
  ],
  [
   "IN080103001",
   "Computers Hardware & Equipments",
   "Manufactures and distributors of computer hardware and equipments such as personal computers, laptops, servers, motherboards, networking equipments, printers, photo copiers etc."
  ],
  [
   "IN090101001",
   "Dredging",
   "Companies providing dredging and related services"
  ],
  [
   "IN090102001",
   "Airline",
   "Owners and operators of commercial airlines"
  ],
  [
   "IN090102002",
   "Logistics Solution Provider",
   "Companies providing logistic services, courier, movers & packers etc."
  ],
  [
   "IN090102003",
   "Railways",
   "Companies providing passenger or cargo transportation through railways"
  ],
  [
   "IN090102004",
   "Road Transport",
   "Companies providing passenger or cargo transportation through roads"
  ],
  [
   "IN090102005",
   "Shipping",
   "Companies providing passenger or cargo transportation through marine (shipping)"
  ],
  [
   "IN090102006",
   "Transport Related Services",
   "Other transport related service not covered elsewhere"
  ],
  [
   "IN090103001",
   "Airport & Airport services",
   "Owners and operators of airports and companies providing airport related services"
  ],
  [
   "IN090103002",
   "Port & Port services",
   "Owners and operators of marine ports and related services like marine engineering services"
  ],
  [
   "IN090103004",
   "Road Assets–Toll, Annuity, Hybrid- Annuity",
   "Operators of bridge, highway, toll bridges etc. Does not include companies engaged into construction of road, bridges and highways which are classified as 'Civil Construction' under 'Manufacturing'"
  ],
  [
   "IN090104001",
   "Trading & Distributors",
   "Companies engaged in trading and distribution of goods not covered elsewhere"
  ],
  [
   "IN090104002",
   "Consulting Services",
   "Companies engaged in providing consulting services"
  ],
  [
   "IN090104003",
   "Data Processing Services",
   "Companies engaged in providing commercial electronic data processing services"
  ],
  [
   "IN090104004",
   "Diversified Commercial Services",
   "Companies providing commercial and consumer services not classified elsewhere. Includes, employment and related services, environmental services and pollution control services, other security services, renting and leasing services, trade and commission agent services etc."
  ],
  [
   "IN090104005",
   "Business Process Outsourcing (BPO)/ Knowledge Process Outsourcing (KPO)",
   "Companies engaged in providing Business Process Outsourcing (BPO)/ Knowledge Process Outsourcing (KPO) services"
  ],
  [
   "IN090105001",
   "Urban Local Bodies",
   "Local bodies that administer or govern a city or a town"
  ],
  [
   "IN090105002",
   "Development Authority",
   "Development authority of a city/ region"
  ],
  [
   "IN100101001",
   "Telecom - Cellular & Fixed line services",
   "Companies providing fixed line and cellular telecom services"
  ],
  [
   "IN100101002",
   "Telecom - Infrastructure",
   "Companies engaged into provision of telecom instruments and telecom related infrastructure services."
  ],
  [
   "IN100101003",
   "Other Telecom Services",
   "Companies engaged into provision of broad band internet service and other telecom related services not covered elsewhere"
  ],
  [
   "IN100102001",
   "Telecom - Equipment & Accessories",
   "Manufacturers and distributors of telecom equipments, cables and other accessories. Includes investment trusts where underlying is telecom equipment such as telephone instruments"
  ],
  [
   "IN110101004",
   "Power Generation",
   "Companies engaged in the production of renewable and non-renewable power. Includes investment trusts where underlying is power generation"
  ],
  [
   "IN110101005",
   "Integrated Power Utilities",
   "Companies / investment trusts with its presence across multiple segments such as power generation, transmission and distribution"
  ],
  [
   "IN110101002",
   "Power Trading",
   "Companies engaged into trading of electricity"
  ],
  [
   "IN110101003",
   "Power - Transmission",
   "Companies engaged into transmission of electricity. Includes investment trusts where underlying is power transmission"
  ],
  [
   "IN110101006",
   "Power Distribution",
   "Companies engaged in the distribution of power. Includes investment trusts where underlying is power distribution"
  ],
  [
   "IN110201001",
   "Water Supply & Management",
   "Companies engaged into water supply and management"
  ],
  [
   "IN110201002",
   "Waste Management",
   "Companies engaged into waste management"
  ],
  [
   "IN110201003",
   "Emergency Services",
   "Companies engaged into providing emergency services like fire brigade, flood management etc."
  ],
  [
   "IN110201004",
   "Multi Utilities",
   "Companies providing multiple lines of utilities"
  ],
  [
   "IN110201005",
   "Other Utilities",
   "Companies providing utilities not covered elsewhere"
  ],
  [
   "IN120101001",
   "Diversified",
   "Companies engaged into multiple business segment, where no single business segment contributes more than 50% of companies' total revenue and two or more segments each contributes at least 20% of total revenue"
  ]
 ]
};
