import SearchClient from "@/components/SearchClient";

export default async function SearchPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const rawQuery = searchParams.q;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery || "";

  return (
    <main className="min-h-screen pb-20">
      <SearchClient query={query} />
    </main>
  );
}