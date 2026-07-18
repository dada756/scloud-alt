import { NextResponse } from 'next/server';
import { queryD1 } from '@/lib/d1';

// Enforce the Edge Runtime for maximum performance
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // 1. Authentication Layer
    const authHeader = request.headers.get('Authorization');
    const expectedSecret = process.env.INTERNAL_API_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Payload Parsing
    const body = await request.json();
    const { token, expires_at } = body;

    // 3. Validation
    if (!token || !expires_at) {
      return NextResponse.json(
        { error: 'Missing required fields (token, expires_at)' },
        { status: 400 }
      );
    }

    // Basic date validation to ensure the token isn't already dead on arrival
    const expirationDate = new Date(expires_at);
    if (isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
      return NextResponse.json(
        { error: 'Invalid or expired date format provided' },
        { status: 400 }
      );
    }

    // 4. Database Operations
    // We execute these sequentially to ensure data integrity
    
    // Insert the new ad_verified token into the stack as 'queued'
    const insertQuery = `
      INSERT INTO tokens (token_value, expires_at, status, search_count)
      VALUES (?, ?, 'queued', 0)
    `;
    await queryD1(insertQuery, [token, expires_at]);

    // Release the concurrency lock so the system knows the GitHub Action has finished
    const releaseLockQuery = `
      UPDATE system_state 
      SET state_value = 'false' 
      WHERE state_key = 'git_workflow_triggered'
    `;
    await queryD1(releaseLockQuery);

    // 5. Success Response
    return NextResponse.json(
      { success: true, message: 'Token ingested and lock released.' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Token sync failed:', error);
    return NextResponse.json(
      { error: 'Internal server error during token synchronization' },
      { status: 500 }
    );
  }
}