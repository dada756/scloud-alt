import { NextResponse } from 'next/server';
import { queryD1 } from '@/lib/d1';
import * as cheerio from 'cheerio';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BROWSER_TOKEN = "3f132a0c3d414a8fb4a02775f61b6a04|7e902b4485babe129208d474402e921516f2f0d8b2b98cd23fb8a2e226bef6d3";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const searchQuery = query.replace(/ /g, '+');

    // 1. Fetch current active token & system state from D1
    const tokenRows = await queryD1(
      "SELECT * FROM tokens WHERE status = 'active' OR status = 'queued' ORDER BY status ASC, created_at DESC LIMIT 1"
    );
    const lockRows = await queryD1(
      "SELECT state_value FROM system_state WHERE state_key = 'git_workflow_triggered' LIMIT 1"
    );

    let activeTokenRow = tokenRows?.[0];
    const isWorkflowLocked = lockRows?.[0]?.state_value === 'true';

    // 2. Token Integrity & Expiration Check
    const now = new Date();
    if (activeTokenRow) {
      const expiresAt = new Date(activeTokenRow.expires_at);
      // If token expired or hit absolute max limit, deplete it
      if (now >= expiresAt || activeTokenRow.search_count >= 45) {
        await queryD1("UPDATE tokens SET status = 'depleted' WHERE id = ?", [activeTokenRow.id]);
        
        // Try fetching a backup queued token instantly
        const backupRows = await queryD1("SELECT * FROM tokens WHERE status = 'queued' ORDER BY created_at DESC LIMIT 1");
        if (backupRows?.[0]) {
          activeTokenRow = backupRows[0];
          await queryD1("UPDATE tokens SET status = 'active' WHERE id = ?", [activeTokenRow.id]);
        } else {
          activeTokenRow = null;
        }
      } else if (activeTokenRow.status === 'queued') {
        // Elevate first queued token if no active token existed
        await queryD1("UPDATE tokens SET status = 'active' WHERE id = ?", [activeTokenRow.id]);
        activeTokenRow.status = 'active';
      }
    }

    if (!activeTokenRow) {
      // Trigger emergency run if everything is dead and no workflow is active
      if (!isWorkflowLocked) {
        await triggerGitHubWorkflow();
      }
      return NextResponse.json({ error: 'System is initializing clearance tokens. Please try again shortly.' }, { status: 503 });
    }

    // 3. Increment Counter & Milestone Check (Trigger at exactly 40 searches)
    const newCount = activeTokenRow.search_count + 1;
    await queryD1("UPDATE tokens SET search_count = ? WHERE id = ?", [newCount, activeTokenRow.id]);

    if (newCount === 40 && !isWorkflowLocked) {
      await triggerGitHubWorkflow();
    }

    // 4. HOLY HEADERS EXECUTION (100% Unmodified from Original Blueprint)
    const url = "https://scloudx.lol/get-search-token";
    const ad_verified = activeTokenRow.token_value;

    const response = await fetch(url, {
      method: 'POST',
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
      body: `search_query=${searchQuery}`,
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Target search failed with status ${response.status}`);
    }

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

// Helper to asynchronously execute the GitHub Dispatch Event
async function triggerGitHubWorkflow() {
  try {
    // Instantly claim the lock in D1 to prevent execution race conditions
    await queryD1("UPDATE system_state SET state_value = 'true' WHERE state_key = 'git_workflow_triggered'");

    const repoOwner = process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GITHUB_REPO_NAME;
    const pat = process.env.GITHUB_PAT;

    // Fire-and-forget call to GitHub Rest API
    fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-Edge-Muxer'
      },
      body: JSON.stringify({ event_type: 'generate-clearance-token' })
    });
  } catch (err) {
    console.error('Failed to dispatch GitHub Action:', err);
    // Safe reset fallback
    await queryD1("UPDATE system_state SET state_value = 'false' WHERE state_key = 'git_workflow_triggered'");
  }
}