// The imported workbook lists the same shop beside several nearby heritage sites.
// Keep each physical venue once and retain only links to the active route or custom tour.
export function venuesForTour(venues, siteIds) {
  if (!siteIds.length) return [];
  const selected = new Set(siteIds);
  return venues.flatMap(venue => {
    const nearSelected = venue.near.filter(link => selected.has(link.siteId));
    return nearSelected.length ? [{...venue, nearSelected}] : [];
  });
}
