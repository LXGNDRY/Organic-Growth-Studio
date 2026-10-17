import { NextRequest, NextResponse } from 'next/server';
import { analyzeUrl } from '@/lib/analyzer';
import { normalizeTargetUrl } from '@/lib/url';

export const runtime='nodejs';
export async function POST(request:NextRequest) {
  try {
    const body=await request.json();
    if(typeof body.url!=='string' || body.url.length>2048) return NextResponse.json({error:'Enter a valid URL under 2,048 characters.'},{status:400});
    const result=await analyzeUrl(normalizeTargetUrl(body.url));
    return NextResponse.json(result);
  } catch(error) {
    const message=error instanceof Error?error.message:'The page could not be analyzed.';
    return NextResponse.json({error:message},{status:422});
  }
}
