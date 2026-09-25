import { buildPaginationMeta, paginate, toSkipTake } from "@/common/utils/pagination.util.js";

describe("toSkipTake", () => {
    it("computes skip from page and limit", () => {
        expect(toSkipTake({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
        expect(toSkipTake({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
    });
});

describe("buildPaginationMeta", () => {
    it("carries page and limit through alongside total", () => {
        expect(buildPaginationMeta({ page: 2, limit: 20 }, 45)).toEqual({ page: 2, limit: 20, total: 45 });
    });
});

describe("paginate", () => {
    it("wraps items and meta in the response envelope shape", () => {
        const items = [{ id: "a" }, { id: "b" }];

        expect(paginate(items, { page: 1, limit: 20 }, 2)).toEqual({
            data: items,
            meta: { page: 1, limit: 20, total: 2 },
        });
    });
});
