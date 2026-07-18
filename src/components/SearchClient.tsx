"use client";

import { useState, useEffect } from "react";
import SearchBar from "@/components/SearchBar";

interface SearchResult {
  title: string;
  size: string;
  url: string;
}

export default function SearchClient({ query }: { query: string }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for selections and copied notification
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch results");
        
        setResults(data.results || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (query) {
      fetchResults();
    }
  }, [query]);

  // Size parsing ported from webview JS
  const parseSizeToBytes = (sizeStr: string) => {
    if (!sizeStr) return 0;
    const match = sizeStr.trim().match(/^([\d.]+)\s*(KB|MB|GB|TB)?$/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2] ? match[2].toUpperCase() : "";
    const multipliers: Record<string, number> = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return value * (multipliers[unit] || 1);
  };

  const handleSort = (direction: 'asc' | 'desc') => {
    const sorted = [...results].sort((a, b) => {
      const sizeA = parseSizeToBytes(a.size);
      const sizeB = parseSizeToBytes(b.size);
      return direction === 'asc' ? sizeA - sizeB : sizeB - sizeA;
    });
    setResults(sorted);
  };

  const toggleSelectAll = () => {
    if (selectedUrls.size === results.length) {
      setSelectedUrls(new Set()); // Deselect all
    } else {
      setSelectedUrls(new Set(results.map(r => r.url).filter(Boolean))); // Select all valid URLs
    }
  };

  const toggleSelect = (url: string) => {
    const next = new Set(selectedUrls);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedUrls(next);
  };

  const copySelected = async () => {
    if (selectedUrls.size === 0) return;
    const combinedUrls = Array.from(selectedUrls).join(",");
    try {
      await navigator.clipboard.writeText(combinedUrls);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6">
        <SearchBar initialQuery={query} />
      </div>

      {loading ? (
        <div className="space-y-4 mt-8">
          <div className="h-8 bg-black rounded w-48 mb-6 animate-pulse"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-black rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center p-10 bg-card border border-border rounded-xl">
          <svg className="w-12 h-12 text-accent mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <h2 className="text-xl font-bold mb-2">Search Error</h2>
          <p className="text-muted">{error}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <span className="font-bold pl-3 pr-3 text-lg">{results.length} Results</span>
              <button onClick={() => handleSort('asc')} className="bg-[#070707] hover:bg-border border border-border px-5 py-3 font-semibold rounded-md text-md transition-colors">
                Size ↑
              </button>
              <button onClick={() => handleSort('desc')} className="bg-[#070707] hover:bg-border border border-border px-5 py-3 font-semibold rounded-md text-md transition-colors">
                Size  ↓
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="bg-[#070707] hover:bg-border border border-border px-5 py-3 font-semibold rounded-md text-md transition-colors">
                Select All
              </button>
              <button onClick={copySelected} className="netflix-accent hover:bg-accent-hover text-white px-6 py-3 rounded-md text-md font-semibold transition-colors w-42">
                {copied ? "Copied!" : "Copy Selected"}
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {results.map((item, idx) => (
              <div key={idx} className="flex items-center bg-[black] hover:bg-card-hover border-2 border-border rounded-xl py-5 px-5 gap-4 transition-colors">
                <input
                  type="checkbox"
                  className="custom-checkbox"
                  checked={selectedUrls.has(item.url)}
                  onChange={() => toggleSelect(item.url)}
                />
                <div className="flex-grow font-medium text-[15px] pr-18">
                  {item.title}
                </div>
                <div className="flex items-center gap-2 bg-accent-transparent text-[#ef5350] border border-accent-border px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  {item.size}
                </div>
              </div>
            ))}
            
            {results.length === 0 && (
              <div className="text-center p-10 text-muted border border-border border-dashed rounded-xl">
                No results found for &quot;{query}&quot;
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}