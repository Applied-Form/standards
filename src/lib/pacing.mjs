/**
 * How a long document is paced when printed, from positions alone (decision 0032). Pages are counted
 * from scroll position, as orphan headings are, so the numbers are estimates of printed pages.
 *
 * The reading zone runs from the top of the document to the back matter, or to the end if there is
 * none. An opener below the back matter is ignored. A run is a stretch of consecutive reading pages
 * with no opener on them; the opener's own page is not part of a run.
 *
 * @param {{ pageH: number, scrollHeight: number, openerTops: number[], backMatterTop: number | null }} m
 *   Pixel measures: the printed page height, the document height, the document y of each opener and
 *   of the first back-matter element.
 * @returns {{ readingPages: number, openers: number[], longestRun: number, pagesPerOpener: number }}
 *   `openers` is the distinct zero-based page indices of the openers inside the reading zone.
 */
export function measurePacing({ pageH, scrollHeight, openerTops, backMatterTop }) {
  const end = backMatterTop ?? scrollHeight;
  const readingPages = Math.max(0, Math.ceil(end / pageH));
  const openers = [...new Set(openerTops.filter((y) => y < end).map((y) => Math.floor(y / pageH)))].sort((a, b) => a - b);
  let longestRun = 0;
  let prev = -1;
  for (const page of [...openers, readingPages]) {
    longestRun = Math.max(longestRun, page - prev - 1);
    prev = page;
  }
  const pagesPerOpener = readingPages === 0 ? 0 : readingPages / Math.max(1, openers.length);
  return { readingPages, openers, longestRun, pagesPerOpener };
}
