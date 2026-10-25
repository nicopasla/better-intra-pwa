/**
 * Mock images: The Cat API's CDN serves one stable picture per image id, so the
 * mock data can hand out distinct cat photos without a runtime request. Ids
 * were collected from https://api.thecatapi.com/v1/images/search.
 */
const CAT_IMAGE_IDS = [
  "c8u", "5sp", "17l", "MTg3NzE0Mw", "bt", "dg6",
  "Z6d8vsYAo", "MTY4MDkyOA", "9vg", "MjA5MDgyOQ", "d9e", "dm7",
  "MTkyNjU3NQ", "bmd", "e48", "2gq", "MTc3NTQxNw", "8of",
  "cva", "bi2", "uo", "xNuSF5YWY", "6uu", "dra",
  "OhajKveSR", "43v", "ddb", "5ht", "b21", "r5FkDFDre",
  "d74", "6an", "a96", "77u", "9un", "c5d",
  "m4", "MTU1ODQwOA", "599", "YQtmOXP0_", "MWPRkZh6u", "_GVSjXZ4i",
  "blj", "DTcYhC380", "ae9", "be7", "d45", "_qUK20W2d",
  "dvs", "a8l", "_ulVqeR9J", "MTg1NDIwNQ", "47c", "VsxceZVop",
  "bkd", "252", "a33", "MTcwNDE3NA", "cda", "b41",
  "3ec", "dkh",
];

/** A distinct cat picture for each `index` (repeats only once the pool runs out). */
export function catImage(index: number): string {
  const id = CAT_IMAGE_IDS[Math.abs(Math.trunc(index)) % CAT_IMAGE_IDS.length];
  return `https://cdn2.thecatapi.com/images/${id}.jpg`;
}
