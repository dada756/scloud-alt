import { NextResponse } from 'next/server';
import { queryD1 } from '@/lib/d1';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

// REMOVED: export const runtime = 'edge';
// We are now running on standard Node.js to support HTTPS Proxy Agents
export const dynamic = 'force-dynamic';

const BROWSER_TOKEN = "3f132a0c3d414a8fb4a02775f61b6a04|7e902b4485babe129208d474402e921516f2f0d8b2b98cd23fb8a2e226bef6d3";
let cachedToken: any = null;

// Helper to randomly select and format a residential proxy
function getProxyAgent() {
  const rawList = process.env.PROXY_LIST || "";
  const proxies = rawList.split(',').map(p => p.trim()).filter(Boolean);
  
  if (proxies.length === 0) return undefined;
  
  const chosen = proxies[Math.floor(Math.random() * proxies.length)];
  const [ip, port, user, password] = chosen.split(':'); // Extracts from IP:PORT:USER:PASS format[cite: 2]
  
  const proxyUrl = `http://${user}:${password}@${ip}:${port}`;
  return new HttpsProxyAgent(proxyUrl);
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query) return NextResponse.json({ error: 'Query is required' }, { status: 400 });

    const searchQuery = query.replace(/ /g, '+');
    const now = new Date();

    // 1. LIGHTNING READ: Check Cache first, fallback to D1
    if (!cachedToken || now >= new Date(cachedToken.expires_at) || cachedToken.search_count >= 40) {
      const tokenRows = await queryD1(
        "SELECT * FROM tokens WHERE status = 'active' OR status = 'queued' ORDER BY status ASC, created_at DESC LIMIT 1"
      );
      cachedToken = tokenRows?.[0] || null;
      
      if (cachedToken && cachedToken.status === 'queued') {
        cachedToken.status = 'active';
        queryD1("UPDATE tokens SET status = 'active' WHERE id = ?", [cachedToken.id]).catch(console.error);
      }
    }

    if (!cachedToken) {
      return NextResponse.json({ error: 'System is initializing clearance tokens.' }, { status: 503 });
    }

    // 2. CRITICAL PATH: Execute the target scrape through the Residential Proxy
    const ad_verified = cachedToken.token_value;
    const url = "https://scloudx.lol/get-search-token";
    const proxyAgent = getProxyAgent();
    
    const targetFetchPromise = fetch(url, {
      method: 'POST',
      agent: proxyAgent, // Routes request through Webshare IP
      headers: {
        "Host": "scloudx.lol",
        "Cookie": `browser_token=${BROWSER_TOKEN}; ad_verified=${ad_verified};`,
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Not-A.Brand";v="24", "Chromium";v="146"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://scloudx.lol",
        "Content-Type": "application/x-www-form-urlencoded",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-User": "?1",
        "Sec-Fetch-Dest": "document",
        "Referer": "https://scloudx.lol/",
        "Accept-Encoding": "gzip, deflate, br",
        "Priority": "u=0, i"
      },
      body: `search_query=${searchQuery}`
    });

    // 3. BACKGROUND TASKS: Update D1 and check triggers
    cachedToken.search_count += 1;
    const backgroundTasks = [];
    
    backgroundTasks.push(
      queryD1("UPDATE tokens SET search_count = ? WHERE id = ?", [cachedToken.search_count, cachedToken.id])
    );

    if (cachedToken.search_count === 40) {
      backgroundTasks.push(triggerGitHubWorkflow());
    }

    Promise.allSettled(backgroundTasks);

    // 4. RESOLVE CRITICAL PATH: Process HTML
    const response = await targetFetchPromise;
    if (!response.ok) throw new Error(`Target search failed: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: any[] = [];

    $('.result-item').each((_, element) => {
      const title = $(element).attr('data-title') || 'Unknown Title';
      const size = $(element).attr('data-size') || 'Unknown Size';
      const urlVal = $(element).find('.copy-checkbox').attr('data-url') || '';
      results.push({ title, size, url: urlVal });
    });

    return NextResponse.json({ status: "success", results, count: results.length });

  } catch (error: any) {
    console.error('Search routing failure:', error);
    return NextResponse.json({ error: 'Internal execution error', details: error.message }, { status: 500 });
  }
}

async function triggerGitHubWorkflow() {
  try {
    const lockRows = await queryD1("SELECT state_value FROM system_state WHERE state_key = 'git_workflow_triggered' LIMIT 1");
    if (lockRows?.[0]?.state_value === 'true') return;

    await queryD1("UPDATE system_state SET state_value = 'true' WHERE state_key = 'git_workflow_triggered'");
    // Uses native edge-compatible fetch for the GitHub API call
    globalThis.fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-Node-Muxer'
      },
      body: JSON.stringify({ event_type: 'generate-clearance-token' })
    });
  } catch (err) {
    console.error('GitHub trigger failed:', err);
  }
}