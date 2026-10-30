import test from "node:test";
import assert from "node:assert/strict";
import {
  searchNames,
  rankPlaces,
  regionDetail,
} from "../isitrainy/geocoding.mjs";
const cheonan = {
  id: 1845759,
  name: "천안시",
  country: "대한민국",
  country_code: "KR",
  admin1: "충청남도",
  admin2: "천안시",
  latitude: 36.8065,
  longitude: 127.1522,
  feature_code: "PPLA2",
  population: 658831,
};
const north = {
  id: 13550479,
  name: "천안",
  country: "북한",
  country_code: "KP",
  admin1: "강원도",
  admin2: "이천군",
  latitude: 38.49907,
  longitude: 126.90094,
};

test("searches city suffixes and official metropolitan names without guessing coordinates", () => {
  assert.deepEqual(searchNames("천안", "KR"), ["천안", "천안시"]);
  assert.ok(searchNames("부산", "KR").includes("부산광역시"));
  assert.deepEqual(searchNames("충청남도 천안시", "KR"), ["천안시"]);
  assert.deepEqual(searchNames("청양군", "KR"), ["청양군"]);
  assert.deepEqual(searchNames("Tokyo", "all"), ["Tokyo"]);
});
test("a domestic search rejects namesakes in other countries even if the API includes them", () => {
  assert.deepEqual(rankPlaces([north, cheonan], "천안", "KR"), [cheonan]);
  assert.equal(rankPlaces([north], "천안", "KR").length, 0);
  assert.equal(rankPlaces([north, cheonan], "천안", "all").length, 2);
});
test("merges duplicate responses but keeps distinct places with the same name", () => {
  assert.equal(rankPlaces([cheonan, { ...cheonan }], "천안", "KR").length, 1);
  const other = { ...cheonan, id: 123, latitude: 37, admin1: "경기도" };
  assert.equal(rankPlaces([cheonan, other], "천안", "KR").length, 2);
});
test("respects explicitly requested administrative regions and common province abbreviations", () => {
  const other = { ...cheonan, id: 123, admin1: "경기도" };
  assert.deepEqual(rankPlaces([other, cheonan], "충청남도 천안시", "KR"), [
    cheonan,
  ]);
  assert.deepEqual(rankPlaces([other, cheonan], "충남 천안", "KR"), [cheonan]);
});
test("prioritizes a populated administrative city over a small exact-name settlement", () => {
  const village = {
    id: 1,
    name: "부산",
    country_code: "KR",
    latitude: 35,
    longitude: 127,
    feature_code: "PPL",
  };
  const city = {
    id: 2,
    name: "부산광역시",
    country_code: "KR",
    latitude: 35.1796,
    longitude: 129.0756,
    feature_code: "PPLA",
    population: 3285147,
  };
  assert.equal(rankPlaces([village, city], "부산", "KR")[0].id, 2);
});
test("shows country and both administrative levels, deduplicating repeated labels", () => {
  assert.equal(regionDetail(cheonan), "대한민국 · 충청남도 · 천안시");
  assert.equal(
    regionDetail({
      country: "대한민국",
      admin1: "서울특별시",
      admin2: "서울특별시",
    }),
    "대한민국 · 서울특별시",
  );
  assert.equal(
    rankPlaces([{ ...cheonan, latitude: "36.8065" }], "천안", "KR").length,
    0,
  );
});
