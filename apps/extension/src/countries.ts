/** ISO 3166-1 alpha-2 code by lower-case, accent-stripped English name (and common GeoGuessr variants). */
const TABLE = `
AF Afghanistan|AL Albania|DZ Algeria|AD Andorra|AO Angola|AR Argentina|AM Armenia|AU Australia|AT Austria|AZ Azerbaijan
BS Bahamas|BH Bahrain|BD Bangladesh|BB Barbados|BY Belarus|BE Belgium|BZ Belize|BJ Benin|BT Bhutan|BO Bolivia
BA Bosnia and Herzegovina|BW Botswana|BR Brazil|BN Brunei|BG Bulgaria|BF Burkina Faso|BI Burundi|KH Cambodia|CM Cameroon
CA Canada|CV Cape Verde|CF Central African Republic|TD Chad|CL Chile|CN China|CO Colombia|KM Comoros
CG Republic of the Congo|CD Democratic Republic of the Congo|CD DR Congo|CR Costa Rica|CI Ivory Coast|CI Cote d'Ivoire
HR Croatia|CU Cuba|CY Cyprus|CZ Czechia|CZ Czech Republic|DK Denmark|DJ Djibouti|DO Dominican Republic|EC Ecuador|EG Egypt
SV El Salvador|GQ Equatorial Guinea|ER Eritrea|EE Estonia|SZ Eswatini|SZ Swaziland|ET Ethiopia|FJ Fiji|FI Finland|FR France
GA Gabon|GM Gambia|GE Georgia|DE Germany|GH Ghana|GR Greece|GL Greenland|GT Guatemala|GN Guinea|GW Guinea-Bissau|GY Guyana
HT Haiti|HN Honduras|HK Hong Kong|HU Hungary|IS Iceland|IN India|ID Indonesia|IR Iran|IQ Iraq|IE Ireland|IL Israel|IT Italy
JM Jamaica|JP Japan|JO Jordan|KZ Kazakhstan|KE Kenya|XK Kosovo|KW Kuwait|KG Kyrgyzstan|LA Laos|LV Latvia|LB Lebanon
LS Lesotho|LR Liberia|LY Libya|LI Liechtenstein|LT Lithuania|LU Luxembourg|MO Macao|MG Madagascar|MW Malawi|MY Malaysia
MV Maldives|ML Mali|MT Malta|MR Mauritania|MU Mauritius|MX Mexico|MD Moldova|MC Monaco|MN Mongolia|ME Montenegro|MA Morocco
MZ Mozambique|MM Myanmar|NA Namibia|NP Nepal|NL Netherlands|NZ New Zealand|NI Nicaragua|NE Niger|NG Nigeria
MK North Macedonia|MK Macedonia|NO Norway|OM Oman|PK Pakistan|PS Palestine|PA Panama|PG Papua New Guinea|PY Paraguay|PE Peru
PH Philippines|PL Poland|PT Portugal|PR Puerto Rico|QA Qatar|RO Romania|RU Russia|RW Rwanda|SM San Marino|SA Saudi Arabia
SN Senegal|RS Serbia|SC Seychelles|SL Sierra Leone|SG Singapore|SK Slovakia|SI Slovenia|SO Somalia|ZA South Africa
KR South Korea|SS South Sudan|ES Spain|LK Sri Lanka|SD Sudan|SR Suriname|SE Sweden|CH Switzerland|SY Syria|TW Taiwan
TJ Tajikistan|TZ Tanzania|TH Thailand|TL Timor-Leste|TG Togo|TO Tonga|TT Trinidad and Tobago|TN Tunisia|TR Turkey
TR Turkiye|TM Turkmenistan|UG Uganda|UA Ukraine|AE United Arab Emirates|GB United Kingdom|GB UK|US United States
US United States of America|US USA|UY Uruguay|UZ Uzbekistan|VU Vanuatu|VA Vatican City|VE Venezuela|VN Vietnam|YE Yemen
ZM Zambia|ZW Zimbabwe|KP North Korea|GU Guam|AS American Samoa|MP Northern Mariana Islands|VI US Virgin Islands
FO Faroe Islands|AX Aland Islands|GI Gibraltar|IM Isle of Man|JE Jersey|GG Guernsey|SJ Svalbard and Jan Mayen|BM Bermuda
`;

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const BY_NAME = new Map<string, string>();
for (const entry of TABLE.split('|').flatMap((chunk) => chunk.split('\n'))) {
  const trimmed = entry.trim();
  if (!trimmed) continue;
  const code = trimmed.slice(0, 2);
  BY_NAME.set(normalizeName(trimmed.slice(3)), code);
}

/** Returns the ISO code for a visible country name, or undefined (never guesses). */
export function countryCodeFromName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return BY_NAME.get(normalizeName(name));
}
