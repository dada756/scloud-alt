// lib/d1.ts

export async function queryD1(sql: string, params: any[] = []) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const dbId = process.env.CLOUDFLARE_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  // The specific Cloudflare REST API endpoint for D1 queries
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    // Vercel cache bypass to ensure we always read live data
    cache: 'no-store', 
    body: JSON.stringify({
      sql: sql,
      params: params,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`D1 Query Failed: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  
  // Cloudflare wraps the result in a specific JSON structure
  return data.result[0].results; 
}