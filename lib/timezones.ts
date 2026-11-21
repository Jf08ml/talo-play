// Where visitors are, without a backend or their IP: the browser's time zone
// (`Intl…resolvedOptions().timeZone`, e.g. "America/Bogota") says the country
// well enough. Stored as a database key (`/` isn't allowed there, so `|`) and
// turned into a country name only when shown, so the table can grow later
// without touching what was counted.

/** The browser's time zone as a database key, or "" if unknown. */
export function timeZoneKey(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return tz.replace(/\//g, "|").replace(/[.#$[\]]/g, "").slice(0, 60);
  } catch {
    return "";
  }
}

const EXACT: Record<string, string> = {
  "America/Buenos_Aires": "Argentina",
  "America/Cordoba": "Argentina",
  "America/Mendoza": "Argentina",
  "America/Catamarca": "Argentina",
  "America/Jujuy": "Argentina",
  "America/Montevideo": "Uruguay",
  "America/Asuncion": "Paraguay",
  "America/Santiago": "Chile",
  "America/Punta_Arenas": "Chile",
  "Pacific/Easter": "Chile",
  "America/La_Paz": "Bolivia",
  "America/Lima": "Perú",
  "America/Guayaquil": "Ecuador",
  "Pacific/Galapagos": "Ecuador",
  "America/Bogota": "Colombia",
  "America/Caracas": "Venezuela",
  "America/Panama": "Panamá",
  "America/Costa_Rica": "Costa Rica",
  "America/Managua": "Nicaragua",
  "America/Tegucigalpa": "Honduras",
  "America/El_Salvador": "El Salvador",
  "America/Guatemala": "Guatemala",
  "America/Belize": "Belice",
  "America/Havana": "Cuba",
  "America/Santo_Domingo": "Rep. Dominicana",
  "America/Puerto_Rico": "Puerto Rico",
  "America/Port-au-Prince": "Haití",
  "America/Jamaica": "Jamaica",
  "America/Cayenne": "Guayana Francesa",
  "America/Paramaribo": "Surinam",
  "America/Guyana": "Guyana",
  "Europe/Madrid": "España",
  "Atlantic/Canary": "España",
  "Africa/Ceuta": "España",
  "Europe/Lisbon": "Portugal",
  "Atlantic/Azores": "Portugal",
  "Atlantic/Madeira": "Portugal",
  "Europe/London": "Reino Unido",
  "Europe/Dublin": "Irlanda",
  "Europe/Paris": "Francia",
  "Europe/Rome": "Italia",
  "Europe/Berlin": "Alemania",
  "Europe/Amsterdam": "Países Bajos",
  "Europe/Brussels": "Bélgica",
  "Europe/Zurich": "Suiza",
  "Europe/Vienna": "Austria",
  "Europe/Stockholm": "Suecia",
  "Europe/Oslo": "Noruega",
  "Europe/Copenhagen": "Dinamarca",
  "Europe/Warsaw": "Polonia",
  "Europe/Andorra": "Andorra",
  "Pacific/Honolulu": "Estados Unidos",
  "America/Phoenix": "Estados Unidos",
  "America/Anchorage": "Estados Unidos",
  "America/Boise": "Estados Unidos",
  "America/Detroit": "Estados Unidos",
  "America/Toronto": "Canadá",
  "America/Montreal": "Canadá",
  "America/Vancouver": "Canadá",
  "America/Edmonton": "Canadá",
  "America/Winnipeg": "Canadá",
  "America/Halifax": "Canadá",
  "America/St_Johns": "Canadá",
  "America/Regina": "Canadá",
  "Australia/Sydney": "Australia",
  "Australia/Melbourne": "Australia",
  "Australia/Brisbane": "Australia",
  "Australia/Perth": "Australia",
  "Asia/Tokyo": "Japón",
  "Etc/UTC": "Sin zona (UTC)",
  UTC: "Sin zona (UTC)",
};

const MEXICO = ["Mexico_City", "Cancun", "Merida", "Monterrey", "Matamoros", "Chihuahua", "Ciudad_Juarez", "Ojinaga", "Mazatlan", "Bahia_Banderas", "Hermosillo", "Tijuana"];
const BRASIL = ["Sao_Paulo", "Bahia", "Fortaleza", "Recife", "Belem", "Manaus", "Cuiaba", "Campo_Grande", "Porto_Velho", "Boa_Vista", "Rio_Branco", "Maceio", "Araguaina", "Santarem", "Noronha", "Eirunepe"];
const USA = ["New_York", "Chicago", "Denver", "Los_Angeles"];
for (const c of MEXICO) EXACT[`America/${c}`] = "México";
for (const c of BRASIL) EXACT[`America/${c}`] = "Brasil";
for (const c of USA) EXACT[`America/${c}`] = "Estados Unidos";

const PREFIXES: [string, string][] = [
  ["America/Argentina/", "Argentina"],
  ["America/Indiana/", "Estados Unidos"],
  ["America/Kentucky/", "Estados Unidos"],
  ["America/North_Dakota/", "Estados Unidos"],
];

/** The country a stored time zone key points to; unknown zones show their city. */
export function countryOfTimeZone(key: string): string {
  if (!key || key === "desconocida") return "Desconocido";
  const tz = key.replace(/\|/g, "/");
  if (EXACT[tz]) return EXACT[tz];
  for (const [p, c] of PREFIXES) if (tz.startsWith(p)) return c;
  const city = tz.split("/").pop() ?? tz;
  return `Otro (${city.replace(/_/g, " ")})`;
}
