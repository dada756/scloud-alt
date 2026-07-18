"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="flex p-6 bg-black border-2 border-border rounded-xl overflow-hidden h-28 w-full max-w-3xl mx-auto focus-within:border-accent transition-colors">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movies, series, documentaries..."
        className="flex-grow bg-transparent border-none text-white px-6 text-md outline-none"
        autoComplete="off"
      />
      <button
        type="submit"
        className="netflix-accent rounded-lg cursor-pointer hover:bg-accent-hover text-white text-lg font-semibold px-8 flex items-center justify-center gap-2 transition-colors"
      >
        <svg style={{ width: "20px", height: "20px" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        Search
      </button>
    </form>
  );
}