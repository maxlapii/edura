export type SearchParams = Record<string, string | string[] | undefined>;
export type PageProps<P extends Record<string, string> = Record<string, never>> = { params: Promise<P>; searchParams: Promise<SearchParams> };
