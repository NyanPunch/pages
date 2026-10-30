// GeoNames does not consistently index short Korean city names as aliases.
// Search official administrative names as well; all coordinates still come from the API.
const METROPOLITAN_NAMES = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
};
const REGIONS = {
  충남: "충청남도",
  충북: "충청북도",
  경기: "경기도",
  경남: "경상남도",
  경북: "경상북도",
  전남: "전라남도",
  전북: "전라북도",
  전북특별자치도: "전라북도",
  강원: "강원도",
  강원특별자치도: "강원도",
  제주: "제주특별자치도",
  제주도: "제주특별자치도",
};
const clean = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const regionName = (value) =>
  REGIONS[value] ?? METROPOLITAN_NAMES[value] ?? value;
const coordinatesValid = (place) =>
  Number.isFinite(place.latitude) &&
  Math.abs(place.latitude) <= 90 &&
  Number.isFinite(place.longitude) &&
  Math.abs(place.longitude) <= 180;

export function searchNames(query, scope) {
  const value = clean(query);
  if (scope !== "KR" || !/^[가-힣\s]+$/.test(value)) return [value];
  const core = value.split(" ").at(-1);
  const names = [core];
  if (METROPOLITAN_NAMES[core]) names.push(METROPOLITAN_NAMES[core]);
  if (!/[시군구]$/.test(core)) names.push(`${core}시`);
  return [...new Set(names)];
}

export function regionDetail(place) {
  return [
    ...new Set(
      [
        place.country || place.country_code || "국가 정보 없음",
        place.admin1,
        place.admin2,
      ].filter((value) => typeof value === "string" && value.trim()),
    ),
  ].join(" · ");
}

export function rankPlaces(places, query, scope) {
  const parts = clean(query).split(" ");
  const core = parts.at(-1);
  const qualifiers = scope === "KR" ? parts.slice(0, -1).map(regionName) : [];
  const unique = new Map();
  for (const place of places) {
    if (
      !place ||
      typeof place.name !== "string" ||
      !coordinatesValid(place) ||
      (scope === "KR" && place.country_code !== "KR")
    )
      continue;
    const regions = [
      place.name,
      place.admin1,
      place.admin2,
      place.admin3,
      place.admin4,
    ]
      .filter((value) => typeof value === "string")
      .map(regionName);
    if (
      !qualifiers.every((qualifier) =>
        regions.some((region) => region.includes(qualifier)),
      )
    )
      continue;
    const identity =
      place.id ??
      `${place.country_code}:${place.name}:${place.latitude}:${place.longitude}`;
    if (!unique.has(identity)) unique.set(identity, place);
  }
  const isCity = (place) =>
    /^(PPLC|PPLA\d*|ADM[12])$/.test(place.feature_code ?? "");
  const population = (place) =>
    typeof place.population === "number" && Number.isFinite(place.population)
      ? place.population
      : 0;
  return [...unique.values()]
    .sort(
      (a, b) =>
        Number(isCity(b)) - Number(isCity(a)) ||
        Number(clean(b.name) === core) - Number(clean(a.name) === core) ||
        population(b) - population(a) ||
        a.name.localeCompare(b.name, "ko"),
    )
    .slice(0, 10);
}
