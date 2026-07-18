import SearchBar from "@/components/SearchBar";

export default function Home() {
  return (
    <main className="min-h-screen grainy-bg flex flex-col items-center justify-center px-4 py-1 text-center">
      <div className="w-full max-w-5xl mb-18">
        {/* Hero Section */}
        <h1 className="text-7xl font-black text-accent mb-2">SCLOUD</h1>
        <p className="text-2xl text-gray-300 font-bold mb-12">@iP00Lencodes</p>

        {/* Search Input */}
        <SearchBar />

        {/* Info Grid */}
        
      </div>
    </main>
  );
}