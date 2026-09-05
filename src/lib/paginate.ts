/**
 * Generic, pure pagination.
 *
 * Kept out of any one feature because the page-clamping rules are where paging
 * bugs live, and they are identical everywhere: a page beyond the end must land
 * on the last page rather than render blank, and an empty list must still be a
 * coherent "page 1 of 1" rather than "page 1 of 0".
 */

export interface Page<T> {
	items: T[];
	/** 1-based, clamped into range. */
	page: number;
	pageCount: number;
	/** 1-based index of the first item on this page; 0 when there are none. */
	from: number;
	/** 1-based index of the last item on this page; 0 when there are none. */
	to: number;
	total: number;
	hasPrevious: boolean;
	hasNext: boolean;
}

export function paginate<T>(items: T[], page: number, perPage: number): Page<T> {
	const size = Math.max(1, Math.floor(perPage));
	const total = items.length;
	// An empty list is page 1 of 1, not page 1 of 0 — "Page 1 of 0" is nonsense
	// on screen and makes the Next button's disabled state ambiguous.
	const pageCount = Math.max(1, Math.ceil(total / size));
	const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
	const start = (current - 1) * size;
	const slice = items.slice(start, start + size);

	return {
		items: slice,
		page: current,
		pageCount,
		from: slice.length === 0 ? 0 : start + 1,
		to: start + slice.length,
		total,
		hasPrevious: current > 1,
		hasNext: current < pageCount,
	};
}
