/**
 * Location normalisation (Phase 2.0)
 * ───────────────────────────────────
 * Turns the free-text `jobs.location` string every provider emits into the six
 * normalised columns the jobs filters run on. Pure and deterministic: the same
 * input always yields the same output, which is what lets the backfill
 * recompute every row on every run instead of tracking what it has done.
 *
 * WHY `jobs.country` IS NOT AN INPUT
 * ──────────────────────────────────
 * That column reads 'India' for every RemoteOK row because the schema default
 * applies whenever a provider omits the field, and SmartRecruiters writes
 * lowercase ISO-2. The optional `providerCountry` argument here is the value
 * the PROVIDER emitted for this job in this run — never the stored column.
 * The backfill passes nothing at all.
 *
 * THE SHAPES THIS HAS TO SURVIVE (sampled live, 2026-09-14)
 * ──────────────────────────────────────────────────────────
 *   Adzuna (largest source, /jobs/in/ endpoint):
 *     'India' (31% of results — bare country), 'Bangalore, Karnataka',
 *     'Noida, Ghaziabad', 'Palwal, Faridabad', 'Kochi, Ernakulam',
 *     'Devanahalli, Bangalore Rural' — the second token is often a DISTRICT,
 *     not a state, so districts get their own table.
 *   SmartRecruiters:  'Mumbai, MH', 'New Delhi, DL', 'TG', 'Nassau, '
 *   RemoteOK:         'Worldwide', 'Toronto, ', 'Remote - US', 'Orem, UT',
 *                     'Austin, Austin, Texas, United States', Arabic script
 *   Remotive:         'LATAM, Europe, USA, Canada, APAC'
 *   Lever:            allLocations joined with ', ' → 'Bengaluru, Pune'
 *
 * RULE 6 IS THE ONE THAT MATTERS
 * ──────────────────────────────
 * Unmatched → `isIndia: null`, never false. A location this module cannot
 * place must stay visible in the 'Unknown location' bucket so the user can
 * review it. `false` is reserved for strings that name somewhere else.
 */

export interface NormalizedLocation {
  city?: string;
  /** Full state/province name. */
  region?: string;
  /** Uppercase ISO-2. */
  country?: string;
  /** 'NCR', 'MMR', or the canonical city for everything else. */
  metro?: string;
  isIndia: boolean | null;
  isRemote: boolean;
}

// ─── Tables ───────────────────────────────────────────────────────────────────

const REMOTE_RE =
  /\b(worldwide|remote|remoto|anywhere|work\s*from\s*home|wfh|distributed|global)\b/i;

/** Rule 2 — state abbreviations. `TN` is Tamil Nadu unless the string is already US. */
const IN_STATE_ABBR: Record<string, string> = {
  MH: "Maharashtra",
  DL: "Delhi",
  KA: "Karnataka",
  TG: "Telangana",
  TS: "Telangana",
  TN: "Tamil Nadu",
  UP: "Uttar Pradesh",
  HR: "Haryana",
  GJ: "Gujarat",
  MP: "Madhya Pradesh",
  WB: "West Bengal",
  RJ: "Rajasthan",
  PB: "Punjab",
  KL: "Kerala",
  AP: "Andhra Pradesh",
  OR: "Odisha",
  OD: "Odisha",
  BR: "Bihar",
  JH: "Jharkhand",
  CG: "Chhattisgarh",
  UK: "Uttarakhand",
  UA: "Uttarakhand",
  HP: "Himachal Pradesh",
  GA: "Goa",
  AS: "Assam",
  CH: "Chandigarh",
  JK: "Jammu and Kashmir",
};

const IN_STATES = new Set<string>([
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Chandigarh",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
]);

const IN_STATE_BY_KEY = new Map<string, string>(
  [...IN_STATES].map((name) => [name.toLowerCase(), name]),
);

/** Spellings of state names that differ from the canonical entry above. */
const IN_STATE_ALIASES: Record<string, string> = {
  orissa: "Odisha",
  uttaranchal: "Uttarakhand",
  pondicherry: "Puducherry",
  "new delhi": "Delhi",
  "delhi ncr": "Delhi",
  "national capital territory of delhi": "Delhi",
  "nct of delhi": "Delhi",
  tamilnadu: "Tamil Nadu",
  telengana: "Telangana",
  chattisgarh: "Chhattisgarh",
};

interface CityEntry {
  city: string;
  region: string;
  /** Omitted → metro is the city itself (rule 4, "everything else"). */
  metro?: string;
}

const NCR: Partial<CityEntry> = { metro: "NCR" };
const MMR: Partial<CityEntry> = { metro: "MMR" };

/**
 * Rule 3 (aliases) and rule 4 (metros) live in one table: keys are every
 * spelling we have seen, values are the canonical city. Keys are lowercase.
 */
const IN_CITIES: Record<string, CityEntry> = {
  // ── NCR ──
  delhi: { city: "Delhi", region: "Delhi", ...NCR },
  "new delhi": { city: "New Delhi", region: "Delhi", ...NCR },
  "delhi ncr": { city: "Delhi", region: "Delhi", ...NCR },
  "delhi-ncr": { city: "Delhi", region: "Delhi", ...NCR },
  "delhi/ncr": { city: "Delhi", region: "Delhi", ...NCR },
  ncr: { city: "Delhi", region: "Delhi", ...NCR },
  noida: { city: "Noida", region: "Uttar Pradesh", ...NCR },
  "greater noida": { city: "Greater Noida", region: "Uttar Pradesh", ...NCR },
  gurugram: { city: "Gurugram", region: "Haryana", ...NCR },
  gurgaon: { city: "Gurugram", region: "Haryana", ...NCR },
  faridabad: { city: "Faridabad", region: "Haryana", ...NCR },
  ghaziabad: { city: "Ghaziabad", region: "Uttar Pradesh", ...NCR },
  // ── MMR ──
  mumbai: { city: "Mumbai", region: "Maharashtra", ...MMR },
  bombay: { city: "Mumbai", region: "Maharashtra", ...MMR },
  "mumbai metropolitan region": {
    city: "Mumbai",
    region: "Maharashtra",
    ...MMR,
  },
  "navi mumbai": { city: "Navi Mumbai", region: "Maharashtra", ...MMR },
  thane: { city: "Thane", region: "Maharashtra", ...MMR },
  // ── Everything else: metro = its own city ──
  bengaluru: { city: "Bengaluru", region: "Karnataka" },
  bangalore: { city: "Bengaluru", region: "Karnataka" },
  "bengaluru urban": { city: "Bengaluru", region: "Karnataka" },
  "bangalore urban": { city: "Bengaluru", region: "Karnataka" },
  hyderabad: { city: "Hyderabad", region: "Telangana" },
  secunderabad: {
    city: "Secunderabad",
    region: "Telangana",
    metro: "Hyderabad",
  },
  pune: { city: "Pune", region: "Maharashtra" },
  "pimpri-chinchwad": {
    city: "Pimpri-Chinchwad",
    region: "Maharashtra",
    metro: "Pune",
  },
  "pimpri chinchwad": {
    city: "Pimpri-Chinchwad",
    region: "Maharashtra",
    metro: "Pune",
  },
  chennai: { city: "Chennai", region: "Tamil Nadu" },
  madras: { city: "Chennai", region: "Tamil Nadu" },
  kolkata: { city: "Kolkata", region: "West Bengal" },
  calcutta: { city: "Kolkata", region: "West Bengal" },
  ahmedabad: { city: "Ahmedabad", region: "Gujarat" },
  gandhinagar: { city: "Gandhinagar", region: "Gujarat", metro: "Ahmedabad" },
  surat: { city: "Surat", region: "Gujarat" },
  vadodara: { city: "Vadodara", region: "Gujarat" },
  baroda: { city: "Vadodara", region: "Gujarat" },
  rajkot: { city: "Rajkot", region: "Gujarat" },
  jaipur: { city: "Jaipur", region: "Rajasthan" },
  jodhpur: { city: "Jodhpur", region: "Rajasthan" },
  udaipur: { city: "Udaipur", region: "Rajasthan" },
  chandigarh: { city: "Chandigarh", region: "Chandigarh" },
  mohali: { city: "Mohali", region: "Punjab", metro: "Chandigarh" },
  panchkula: { city: "Panchkula", region: "Haryana", metro: "Chandigarh" },
  ludhiana: { city: "Ludhiana", region: "Punjab" },
  amritsar: { city: "Amritsar", region: "Punjab" },
  indore: { city: "Indore", region: "Madhya Pradesh" },
  bhopal: { city: "Bhopal", region: "Madhya Pradesh" },
  lucknow: { city: "Lucknow", region: "Uttar Pradesh" },
  kanpur: { city: "Kanpur", region: "Uttar Pradesh" },
  agra: { city: "Agra", region: "Uttar Pradesh" },
  varanasi: { city: "Varanasi", region: "Uttar Pradesh" },
  prayagraj: { city: "Prayagraj", region: "Uttar Pradesh" },
  allahabad: { city: "Prayagraj", region: "Uttar Pradesh" },
  coimbatore: { city: "Coimbatore", region: "Tamil Nadu" },
  madurai: { city: "Madurai", region: "Tamil Nadu" },
  tiruchirappalli: { city: "Tiruchirappalli", region: "Tamil Nadu" },
  trichy: { city: "Tiruchirappalli", region: "Tamil Nadu" },
  salem: { city: "Salem", region: "Tamil Nadu" },
  kochi: { city: "Kochi", region: "Kerala" },
  cochin: { city: "Kochi", region: "Kerala" },
  ernakulam: { city: "Kochi", region: "Kerala" },
  thiruvananthapuram: { city: "Thiruvananthapuram", region: "Kerala" },
  trivandrum: { city: "Thiruvananthapuram", region: "Kerala" },
  kozhikode: { city: "Kozhikode", region: "Kerala" },
  calicut: { city: "Kozhikode", region: "Kerala" },
  thrissur: { city: "Thrissur", region: "Kerala" },
  visakhapatnam: { city: "Visakhapatnam", region: "Andhra Pradesh" },
  vizag: { city: "Visakhapatnam", region: "Andhra Pradesh" },
  vijayawada: { city: "Vijayawada", region: "Andhra Pradesh" },
  guntur: { city: "Guntur", region: "Andhra Pradesh" },
  tirupati: { city: "Tirupati", region: "Andhra Pradesh" },
  nagpur: { city: "Nagpur", region: "Maharashtra" },
  nashik: { city: "Nashik", region: "Maharashtra" },
  nasik: { city: "Nashik", region: "Maharashtra" },
  aurangabad: { city: "Aurangabad", region: "Maharashtra" },
  kolhapur: { city: "Kolhapur", region: "Maharashtra" },
  bhubaneswar: { city: "Bhubaneswar", region: "Odisha" },
  cuttack: { city: "Cuttack", region: "Odisha" },
  patna: { city: "Patna", region: "Bihar" },
  ranchi: { city: "Ranchi", region: "Jharkhand" },
  jamshedpur: { city: "Jamshedpur", region: "Jharkhand" },
  raipur: { city: "Raipur", region: "Chhattisgarh" },
  bhilai: { city: "Bhilai", region: "Chhattisgarh" },
  durg: { city: "Durg", region: "Chhattisgarh" },
  dehradun: { city: "Dehradun", region: "Uttarakhand" },
  haridwar: { city: "Haridwar", region: "Uttarakhand" },
  roorkee: { city: "Roorkee", region: "Uttarakhand" },
  guwahati: { city: "Guwahati", region: "Assam" },
  shimla: { city: "Shimla", region: "Himachal Pradesh" },
  goa: { city: "Goa", region: "Goa" },
  panaji: { city: "Panaji", region: "Goa", metro: "Goa" },
  panjim: { city: "Panaji", region: "Goa", metro: "Goa" },
  mysuru: { city: "Mysuru", region: "Karnataka" },
  mysore: { city: "Mysuru", region: "Karnataka" },
  mangaluru: { city: "Mangaluru", region: "Karnataka" },
  mangalore: { city: "Mangaluru", region: "Karnataka" },
  hubli: { city: "Hubballi", region: "Karnataka" },
  hubballi: { city: "Hubballi", region: "Karnataka" },
  belagavi: { city: "Belagavi", region: "Karnataka" },
  belgaum: { city: "Belagavi", region: "Karnataka" },
  warangal: { city: "Warangal", region: "Telangana" },
  jammu: { city: "Jammu", region: "Jammu and Kashmir" },
  srinagar: { city: "Srinagar", region: "Jammu and Kashmir" },
  puducherry: { city: "Puducherry", region: "Puducherry" },
  pondicherry: { city: "Puducherry", region: "Puducherry" },
  vellore: { city: "Vellore", region: "Tamil Nadu" },
  kota: { city: "Kota", region: "Rajasthan" },
  ajmer: { city: "Ajmer", region: "Rajasthan" },
  gwalior: { city: "Gwalior", region: "Madhya Pradesh" },
  jabalpur: { city: "Jabalpur", region: "Madhya Pradesh" },
  meerut: { city: "Meerut", region: "Uttar Pradesh" },
  bareilly: { city: "Bareilly", region: "Uttar Pradesh" },
  sonipat: { city: "Sonipat", region: "Haryana", ...NCR },
  sonepat: { city: "Sonipat", region: "Haryana", ...NCR },
  manesar: { city: "Manesar", region: "Haryana", ...NCR },
  palwal: { city: "Palwal", region: "Haryana", ...NCR },
  ambala: { city: "Ambala", region: "Haryana" },
  karnal: { city: "Karnal", region: "Haryana" },
  hisar: { city: "Hisar", region: "Haryana" },
  rohtak: { city: "Rohtak", region: "Haryana" },
  siliguri: { city: "Siliguri", region: "West Bengal" },
  durgapur: { city: "Durgapur", region: "West Bengal" },
  howrah: { city: "Howrah", region: "West Bengal", metro: "Kolkata" },
  "salt lake": { city: "Kolkata", region: "West Bengal" },
  "greater kolkata": { city: "Kolkata", region: "West Bengal" },
  "kolkata metropolitan area": { city: "Kolkata", region: "West Bengal" },
  "bengaluru metropolitan area": { city: "Bengaluru", region: "Karnataka" },
  "greater bengaluru": { city: "Bengaluru", region: "Karnataka" },
  "greater bangalore": { city: "Bengaluru", region: "Karnataka" },
  "hyderabad metropolitan area": { city: "Hyderabad", region: "Telangana" },
  "greater hyderabad": { city: "Hyderabad", region: "Telangana" },
  "pune metropolitan region": { city: "Pune", region: "Maharashtra" },
  "greater chennai": { city: "Chennai", region: "Tamil Nadu" },
  "chennai metropolitan area": { city: "Chennai", region: "Tamil Nadu" },
  "greater mumbai": { city: "Mumbai", region: "Maharashtra", ...MMR },
  "mumbai suburban": { city: "Mumbai", region: "Maharashtra", ...MMR },
  "mumbai city": { city: "Mumbai", region: "Maharashtra", ...MMR },
  "greater delhi area": { city: "Delhi", region: "Delhi", ...NCR },
  "delhi metropolitan area": { city: "Delhi", region: "Delhi", ...NCR },
};

/**
 * Adzuna's second token is frequently a district. A district settles the state
 * (and the metro where the district IS the metro) without being a city the
 * job is in. Keys are lowercase.
 */
const IN_DISTRICTS: Record<string, { region: string; metro?: string }> = {
  "bangalore rural": { region: "Karnataka", metro: "Bengaluru" },
  "bengaluru rural": { region: "Karnataka", metro: "Bengaluru" },
  "gautam buddha nagar": { region: "Uttar Pradesh", metro: "NCR" },
  "gautam budh nagar": { region: "Uttar Pradesh", metro: "NCR" },
  "south west delhi": { region: "Delhi", metro: "NCR" },
  "south delhi": { region: "Delhi", metro: "NCR" },
  "north delhi": { region: "Delhi", metro: "NCR" },
  "east delhi": { region: "Delhi", metro: "NCR" },
  "west delhi": { region: "Delhi", metro: "NCR" },
  "central delhi": { region: "Delhi", metro: "NCR" },
  "new delhi district": { region: "Delhi", metro: "NCR" },
  raigad: { region: "Maharashtra", metro: "MMR" },
  palghar: { region: "Maharashtra", metro: "MMR" },
  rangareddy: { region: "Telangana", metro: "Hyderabad" },
  "ranga reddy": { region: "Telangana", metro: "Hyderabad" },
  medchal: { region: "Telangana", metro: "Hyderabad" },
  "medchal-malkajgiri": { region: "Telangana", metro: "Hyderabad" },
  kancheepuram: { region: "Tamil Nadu", metro: "Chennai" },
  kanchipuram: { region: "Tamil Nadu", metro: "Chennai" },
  chengalpattu: { region: "Tamil Nadu", metro: "Chennai" },
  tiruvallur: { region: "Tamil Nadu", metro: "Chennai" },
  "north 24 parganas": { region: "West Bengal", metro: "Kolkata" },
  "south 24 parganas": { region: "West Bengal", metro: "Kolkata" },
  "sas nagar": { region: "Punjab", metro: "Chandigarh" },
  "mohali district": { region: "Punjab", metro: "Chandigarh" },
};

/**
 * Countries, keyed by every spelling seen in a location string, value = ISO-2.
 * India is deliberately the only country whose ISO-2 can appear as a BARE
 * two-letter token ('IN') — 'CA' in a location string is California, and the
 * other US-state clashes (DE, IN, OR, ...) are handled by context below.
 */
const COUNTRIES: Record<string, string> = {
  india: "IN",
  bharat: "IN",
  in: "IN",
  ind: "IN",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  us: "US",
  america: "US",
  "united kingdom": "GB",
  uk: "GB",
  "u.k.": "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  canada: "CA",
  australia: "AU",
  germany: "DE",
  deutschland: "DE",
  france: "FR",
  spain: "ES",
  españa: "ES",
  italy: "IT",
  netherlands: "NL",
  "the netherlands": "NL",
  belgium: "BE",
  switzerland: "CH",
  austria: "AT",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  ireland: "IE",
  poland: "PL",
  portugal: "PT",
  greece: "GR",
  turkey: "TR",
  türkiye: "TR",
  israel: "IL",
  "united arab emirates": "AE",
  uae: "AE",
  "saudi arabia": "SA",
  qatar: "QA",
  oman: "OM",
  kuwait: "KW",
  bahrain: "BH",
  egypt: "EG",
  "south africa": "ZA",
  nigeria: "NG",
  kenya: "KE",
  singapore: "SG",
  malaysia: "MY",
  indonesia: "ID",
  thailand: "TH",
  vietnam: "VN",
  philippines: "PH",
  japan: "JP",
  "south korea": "KR",
  korea: "KR",
  china: "CN",
  "hong kong": "HK",
  taiwan: "TW",
  pakistan: "PK",
  bangladesh: "BD",
  "sri lanka": "LK",
  nepal: "NP",
  bhutan: "BT",
  brazil: "BR",
  brasil: "BR",
  mexico: "MX",
  méxico: "MX",
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  peru: "PE",
  bahamas: "BS",
  "the bahamas": "BS",
  "trinidad and tobago": "TT",
  jamaica: "JM",
  "new zealand": "NZ",
  hungary: "HU",
  "czech republic": "CZ",
  czechia: "CZ",
  romania: "RO",
  ukraine: "UA",
  russia: "RU",
  estonia: "EE",
  latvia: "LV",
  lithuania: "LT",
  kyrgyzstan: "KG",
  kazakhstan: "KZ",
  uzbekistan: "UZ",
  cyprus: "CY",
  malta: "MT",
  luxembourg: "LU",
  croatia: "HR",
  serbia: "RS",
  bulgaria: "BG",
  slovakia: "SK",
  slovenia: "SI",
};

/**
 * Multi-country regions Remotive and RemoteOK use. These scope a remote role
 * away from India (rule 1 says remote alone leaves isIndia null; a role limited
 * to "Europe" is not remote-from-India). APAC / Asia include India, so they
 * resolve nothing.
 */
const NON_INDIA_REGIONS = new Set<string>([
  "europe",
  "eu",
  "emea",
  "latam",
  "latin america",
  "south america",
  "north america",
  "americas",
  "usa timezones",
  "us timezones",
  "north america timezones",
  "european timezones",
  "middle east",
  "africa",
  "oceania",
  "anz",
  "gcc",
]);

/** Regions that contain India: a role open to these is not scoped away from it. */
const INCLUDES_INDIA_REGIONS = new Set<string>([
  "apac",
  "asia",
  "asia pacific",
  "asia-pacific",
  "south asia",
  "asia timezones",
  "ist",
  "ist timezone",
]);

const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

const US_STATE_NAMES = new Map<string, string>(
  Object.values(US_STATES).map((name) => [name.toLowerCase(), name]),
);

/** Canadian provinces — RemoteOK writes 'Vancouver, BC, Canada'. */
const CA_PROVINCES: Record<string, string> = {
  BC: "British Columbia",
  AB: "Alberta",
  ON: "Ontario",
  QC: "Quebec",
  MB: "Manitoba",
  SK: "Saskatchewan",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island",
};

const CA_PROVINCE_NAMES = new Map<string, string>(
  Object.values(CA_PROVINCES).map((name) => [name.toLowerCase(), name]),
);

/**
 * Foreign cities that turn up on their own with nothing else to place them
 * ('Toronto, ', 'Nassau, ', 'San Francisco'). Keys lowercase.
 */
const FOREIGN_CITIES: Record<
  string,
  { city: string; region?: string; country: string }
> = {
  toronto: { city: "Toronto", region: "Ontario", country: "CA" },
  vancouver: { city: "Vancouver", region: "British Columbia", country: "CA" },
  montreal: { city: "Montreal", region: "Quebec", country: "CA" },
  montréal: { city: "Montreal", region: "Quebec", country: "CA" },
  ottawa: { city: "Ottawa", region: "Ontario", country: "CA" },
  calgary: { city: "Calgary", region: "Alberta", country: "CA" },
  "north york": { city: "North York", region: "Ontario", country: "CA" },
  nassau: { city: "Nassau", country: "BS" },
  "new york": { city: "New York", region: "New York", country: "US" },
  "new york city": { city: "New York", region: "New York", country: "US" },
  nyc: { city: "New York", region: "New York", country: "US" },
  "san francisco": {
    city: "San Francisco",
    region: "California",
    country: "US",
  },
  sf: { city: "San Francisco", region: "California", country: "US" },
  "san jose": { city: "San Jose", region: "California", country: "US" },
  "los angeles": { city: "Los Angeles", region: "California", country: "US" },
  "redwood city": { city: "Redwood City", region: "California", country: "US" },
  "palo alto": { city: "Palo Alto", region: "California", country: "US" },
  "mountain view": {
    city: "Mountain View",
    region: "California",
    country: "US",
  },
  "menlo park": { city: "Menlo Park", region: "California", country: "US" },
  sunnyvale: { city: "Sunnyvale", region: "California", country: "US" },
  "san diego": { city: "San Diego", region: "California", country: "US" },
  seattle: { city: "Seattle", region: "Washington", country: "US" },
  bellevue: { city: "Bellevue", region: "Washington", country: "US" },
  redmond: { city: "Redmond", region: "Washington", country: "US" },
  austin: { city: "Austin", region: "Texas", country: "US" },
  dallas: { city: "Dallas", region: "Texas", country: "US" },
  houston: { city: "Houston", region: "Texas", country: "US" },
  boston: { city: "Boston", region: "Massachusetts", country: "US" },
  chicago: { city: "Chicago", region: "Illinois", country: "US" },
  denver: { city: "Denver", region: "Colorado", country: "US" },
  boulder: { city: "Boulder", region: "Colorado", country: "US" },
  atlanta: { city: "Atlanta", region: "Georgia", country: "US" },
  miami: { city: "Miami", region: "Florida", country: "US" },
  phoenix: { city: "Phoenix", region: "Arizona", country: "US" },
  portland: { city: "Portland", region: "Oregon", country: "US" },
  philadelphia: { city: "Philadelphia", region: "Pennsylvania", country: "US" },
  pittsburgh: { city: "Pittsburgh", region: "Pennsylvania", country: "US" },
  washington: {
    city: "Washington",
    region: "District of Columbia",
    country: "US",
  },
  "washington dc": {
    city: "Washington",
    region: "District of Columbia",
    country: "US",
  },
  minneapolis: { city: "Minneapolis", region: "Minnesota", country: "US" },
  detroit: { city: "Detroit", region: "Michigan", country: "US" },
  nashville: { city: "Nashville", region: "Tennessee", country: "US" },
  raleigh: { city: "Raleigh", region: "North Carolina", country: "US" },
  charlotte: { city: "Charlotte", region: "North Carolina", country: "US" },
  "salt lake city": { city: "Salt Lake City", region: "Utah", country: "US" },
  "las vegas": { city: "Las Vegas", region: "Nevada", country: "US" },
  london: { city: "London", region: "England", country: "GB" },
  "greater london": { city: "London", region: "England", country: "GB" },
  manchester: { city: "Manchester", region: "England", country: "GB" },
  edinburgh: { city: "Edinburgh", region: "Scotland", country: "GB" },
  dublin: { city: "Dublin", country: "IE" },
  berlin: { city: "Berlin", country: "DE" },
  munich: { city: "Munich", region: "Bavaria", country: "DE" },
  münchen: { city: "Munich", region: "Bavaria", country: "DE" },
  hamburg: { city: "Hamburg", country: "DE" },
  frankfurt: { city: "Frankfurt", region: "Hesse", country: "DE" },
  paris: { city: "Paris", country: "FR" },
  amsterdam: { city: "Amsterdam", country: "NL" },
  madrid: { city: "Madrid", country: "ES" },
  barcelona: { city: "Barcelona", country: "ES" },
  lisbon: { city: "Lisbon", country: "PT" },
  zurich: { city: "Zurich", country: "CH" },
  zürich: { city: "Zurich", country: "CH" },
  stockholm: { city: "Stockholm", country: "SE" },
  oslo: { city: "Oslo", country: "NO" },
  copenhagen: { city: "Copenhagen", country: "DK" },
  helsinki: { city: "Helsinki", country: "FI" },
  warsaw: { city: "Warsaw", country: "PL" },
  prague: { city: "Prague", country: "CZ" },
  budapest: { city: "Budapest", country: "HU" },
  vienna: { city: "Vienna", country: "AT" },
  athens: { city: "Athens", country: "GR" },
  istanbul: { city: "Istanbul", country: "TR" },
  "tel aviv": { city: "Tel Aviv", country: "IL" },
  dubai: { city: "Dubai", country: "AE" },
  "abu dhabi": { city: "Abu Dhabi", country: "AE" },
  riyadh: { city: "Riyadh", country: "SA" },
  doha: { city: "Doha", country: "QA" },
  muscat: { city: "Muscat", country: "OM" },
  cairo: { city: "Cairo", country: "EG" },
  nairobi: { city: "Nairobi", country: "KE" },
  lagos: { city: "Lagos", country: "NG" },
  "cape town": { city: "Cape Town", country: "ZA" },
  johannesburg: { city: "Johannesburg", country: "ZA" },
  singapore: { city: "Singapore", country: "SG" },
  "kuala lumpur": { city: "Kuala Lumpur", country: "MY" },
  jakarta: { city: "Jakarta", country: "ID" },
  bangkok: { city: "Bangkok", country: "TH" },
  "ho chi minh city": { city: "Ho Chi Minh City", country: "VN" },
  hanoi: { city: "Hanoi", country: "VN" },
  manila: { city: "Manila", country: "PH" },
  tokyo: { city: "Tokyo", country: "JP" },
  osaka: { city: "Osaka", country: "JP" },
  seoul: { city: "Seoul", country: "KR" },
  beijing: { city: "Beijing", country: "CN" },
  shanghai: { city: "Shanghai", country: "CN" },
  shenzhen: { city: "Shenzhen", country: "CN" },
  "hong kong": { city: "Hong Kong", country: "HK" },
  taipei: { city: "Taipei", country: "TW" },
  sydney: { city: "Sydney", region: "New South Wales", country: "AU" },
  melbourne: { city: "Melbourne", region: "Victoria", country: "AU" },
  brisbane: { city: "Brisbane", region: "Queensland", country: "AU" },
  perth: { city: "Perth", region: "Western Australia", country: "AU" },
  auckland: { city: "Auckland", country: "NZ" },
  wellington: { city: "Wellington", country: "NZ" },
  karachi: { city: "Karachi", region: "Sindh", country: "PK" },
  lahore: { city: "Lahore", region: "Punjab", country: "PK" },
  islamabad: { city: "Islamabad", country: "PK" },
  dhaka: { city: "Dhaka", country: "BD" },
  colombo: { city: "Colombo", country: "LK" },
  kathmandu: { city: "Kathmandu", country: "NP" },
  "são paulo": { city: "São Paulo", country: "BR" },
  "sao paulo": { city: "São Paulo", country: "BR" },
  "rio de janeiro": { city: "Rio de Janeiro", country: "BR" },
  "mexico city": { city: "Mexico City", country: "MX" },
  "buenos aires": { city: "Buenos Aires", country: "AR" },
  bogotá: { city: "Bogotá", country: "CO" },
  bogota: { city: "Bogotá", country: "CO" },
  santiago: { city: "Santiago", country: "CL" },
  lima: { city: "Lima", country: "PE" },
  "port of spain": { city: "Port of Spain", country: "TT" },
  bishkek: { city: "Bishkek", country: "KG" },
  almaty: { city: "Almaty", country: "KZ" },
  tashkent: { city: "Tashkent", country: "UZ" },
};

/**
 * The metros the Jobs page offers as buckets. Order is display order. The
 * `other_india` bucket is "isIndia and metro not in this list", so this must be
 * the single source of truth shared by the repository filter and the UI.
 */
export const FEATURED_METROS = [
  "NCR",
  "MMR",
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Kolkata",
] as const;

/** Default buckets: where the user is, the big SDE hubs, and location-agnostic remote. */
export const DEFAULT_LOCATION_BUCKETS = [
  "NCR",
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "remote",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lowercase, diacritics folded, whitespace collapsed, trailing punctuation gone. */
function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:/|-]+|[\s,;:/|-]+$/g, "")
    .trim();
}

/** Split 'A, B | C / D - E' into trimmed non-empty tokens. */
function tokenize(raw: string): string[] {
  return raw
    .replace(/\(([^)]*)\)/g, ", $1, ")
    .split(/,|\||;|\/|\s[-–—]\s/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Resolve a country hint the provider emitted ('India', 'in', 'IN', 'CA'). */
function resolveCountryHint(hint?: string | null): string | undefined {
  if (!hint) return undefined;
  const f = fold(hint);
  if (!f) return undefined;
  if (COUNTRIES[f]) return COUNTRIES[f];
  // A bare two-letter code from a provider's own country field is ISO-2 —
  // unlike inside a location string, where 'CA' would be California.
  if (/^[a-z]{2}$/.test(f)) return f.toUpperCase();
  return undefined;
}

// ─── The normaliser ───────────────────────────────────────────────────────────

export function normalizeLocation(
  raw?: string | null,
  providerCountry?: string | null,
): NormalizedLocation {
  const hintCountry = resolveCountryHint(providerCountry);
  const text = (raw ?? "").trim();

  const result: NormalizedLocation = { isIndia: null, isRemote: false };

  // Rule 1 — remote markers. Detected on the whole string before tokenising so
  // 'Work From Home' survives being split on spaces.
  if (REMOTE_RE.test(text)) result.isRemote = true;

  // Working state, filled by whichever token resolves first at each level.
  let city: string | undefined;
  let region: string | undefined;
  let country: string | undefined;
  let metro: string | undefined;
  let scopedAwayFromIndia = false;
  let includesIndiaRegion = false;
  /** Distinct non-India countries named — more than one means "multi-country", not a place. */
  const foreignCountries = new Set<string>();
  /** First token that matched nothing — a candidate city if India is proven later. */
  let firstUnknown: string | undefined;

  // Remote words are stripped from each token rather than the token dropped:
  // 'Remote UK' must still say UK.
  const tokens = tokenize(text)
    .map((t) => {
      const stripped = t.replace(new RegExp(REMOTE_RE.source, "gi"), " ");
      return { original: stripped.trim(), key: fold(stripped) };
    })
    .filter((t) => t.key.length > 0);

  // Pass 1 — unambiguous tokens: Indian cities, districts, full state names,
  // country names, foreign cities, US/CA full names, non-India regions.
  const ambiguous: Array<{ original: string; key: string }> = [];

  for (const t of tokens) {
    const k = t.key;

    const inCity = IN_CITIES[k];
    if (inCity) {
      if (!city) {
        city = inCity.city;
        region = inCity.region;
        metro = inCity.metro ?? inCity.city;
      }
      country = country ?? "IN";
      continue;
    }

    const district = IN_DISTRICTS[k];
    if (district) {
      region = region ?? district.region;
      metro = metro ?? district.metro;
      country = country ?? "IN";
      continue;
    }

    const stateName = IN_STATE_ALIASES[k] ?? IN_STATE_BY_KEY.get(k);
    if (stateName) {
      region = region ?? stateName;
      country = country ?? "IN";
      continue;
    }

    const iso = COUNTRIES[k];
    // 'in' as a bare token is India (rule 5) — but it is also Indiana, so it
    // waits for pass 2 like every other two-letter code.
    if (iso && k !== "in") {
      if (iso === "IN") {
        country = country ?? "IN";
      } else {
        country = country ?? iso;
        foreignCountries.add(iso);
        scopedAwayFromIndia = true;
      }
      continue;
    }

    const foreign = FOREIGN_CITIES[k];
    if (foreign) {
      if (!city) {
        city = foreign.city;
        region = foreign.region;
        metro = foreign.city;
      }
      country = country ?? foreign.country;
      foreignCountries.add(foreign.country);
      scopedAwayFromIndia = true;
      continue;
    }

    const usName = US_STATE_NAMES.get(k);
    if (usName) {
      region = region ?? usName;
      country = country ?? "US";
      scopedAwayFromIndia = true;
      continue;
    }

    const caName = CA_PROVINCE_NAMES.get(k);
    if (caName) {
      region = region ?? caName;
      country = country ?? "CA";
      scopedAwayFromIndia = true;
      continue;
    }

    if (NON_INDIA_REGIONS.has(k)) {
      scopedAwayFromIndia = true;
      continue;
    }

    if (INCLUDES_INDIA_REGIONS.has(k)) {
      includesIndiaRegion = true;
      continue;
    }

    if (/^[a-z]{2}$/.test(k)) {
      ambiguous.push(t);
      continue;
    }

    firstUnknown = firstUnknown ?? t.original;
  }

  // Pass 2 — two-letter abbreviations, resolved with the country context pass 1
  // established. Indian abbreviations win by default (rule 2: 'TG' → Telangana,
  // 'TN' → Tamil Nadu); a string already placed in the US or Canada reads them
  // as that country's subdivisions instead.
  for (const t of ambiguous) {
    const upper = t.key.toUpperCase();

    if (upper === "IN") {
      if (country === "US") region = region ?? "Indiana";
      else country = country ?? "IN";
      continue;
    }
    if (country === "US" && US_STATES[upper]) {
      region = region ?? US_STATES[upper];
      continue;
    }
    if (country === "CA" && CA_PROVINCES[upper]) {
      region = region ?? CA_PROVINCES[upper];
      continue;
    }
    if (IN_STATE_ABBR[upper] && country !== "US" && country !== "CA") {
      region = region ?? IN_STATE_ABBR[upper];
      country = country ?? "IN";
      continue;
    }
    // A US state code with no country yet, where it is not an Indian code
    // either ('UT', 'WY', 'NY'): a US state is the only reading it has.
    if (US_STATES[upper] && !country) {
      region = region ?? US_STATES[upper];
      country = "US";
      scopedAwayFromIndia = true;
      continue;
    }
    if (CA_PROVINCES[upper] && !country) {
      region = region ?? CA_PROVINCES[upper];
      country = "CA";
      scopedAwayFromIndia = true;
      continue;
    }
    firstUnknown = firstUnknown ?? t.original;
  }

  // The provider's own country only fills a gap; the string itself wins.
  if (!country && hintCountry) {
    country = hintCountry;
    if (hintCountry !== "IN") scopedAwayFromIndia = true;
  }

  // 'LATAM, Europe, USA, Canada' names several countries: that is a scope, not
  // a place, so no single country is recorded.
  if (country !== "IN" && foreignCountries.size > 1) {
    country = undefined;
    region = undefined;
    city = undefined;
    metro = undefined;
  }

  // 'Devanahalli, Bangalore Rural' with Devanahalli unknown: India is proven by
  // the district, so the leading token is the city. Only done once a country
  // is known — an unknown token in an unknown string stays unknown.
  if (!city && firstUnknown && country === "IN") {
    city = firstUnknown;
    metro = metro ?? city;
  }

  result.city = city;
  result.region = region;
  result.country = country;
  result.metro = metro;

  // Rule 6 — three-valued. `false` only when the string names somewhere else,
  // and a scope that includes India ('APAC') is not somewhere else.
  if (country === "IN") result.isIndia = true;
  else if ((country || scopedAwayFromIndia) && !includesIndiaRegion)
    result.isIndia = false;
  else result.isIndia = null;

  return result;
}

/**
 * The columns `normalizeLocation` feeds, in the shape the jobs table takes.
 * Used by the write-time normaliser and the backfill so the two cannot drift.
 */
export function toLocationColumns(n: NormalizedLocation): {
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  locationMetro: string | null;
  isIndia: boolean | null;
  isRemote: boolean;
} {
  return {
    locationCity: n.city ?? null,
    locationRegion: n.region ?? null,
    locationCountry: n.country ?? null,
    locationMetro: n.metro ?? null,
    isIndia: n.isIndia,
    isRemote: n.isRemote,
  };
}

/**
 * Which Jobs-page bucket a normalised row lands in. Mirrors the SQL in
 * jobs.repository.ts so the backfill report and the filter agree.
 */
export type LocationBucket =
  | (typeof FEATURED_METROS)[number]
  | "other_india"
  | "remote"
  | "unknown"
  | "abroad";

export function bucketOf(n: {
  isIndia: boolean | null;
  isRemote: boolean;
  /** `NormalizedLocation` shape … */
  metro?: string | null;
  /** … or the column shape from `toLocationColumns` / a DB row. */
  locationMetro?: string | null;
}): LocationBucket {
  const metro = n.metro ?? n.locationMetro ?? null;
  if (n.isIndia === true) {
    const featured = FEATURED_METROS.find((m) => m === metro);
    return featured ?? "other_india";
  }
  if (n.isIndia === null) {
    return n.isRemote ? "remote" : "unknown";
  }
  // Scoped to another country. Remote-elsewhere ('Remote - US') is still
  // elsewhere — the Jobs page's remote bucket excludes it on purpose.
  return "abroad";
}
