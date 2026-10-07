import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function validateDoubanImageUrl(rawUrl: string): string | null {
  try {
    const target = new URL(rawUrl);
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      return 'Unsupported image URL protocol';
    }

    const hostname = target.hostname.toLowerCase();
    if (hostname !== 'doubanio.com' && !hostname.endsWith('.doubanio.com')) {
      return 'Image host is not allowed';
    }

    if (target.username || target.password) {
      return 'Credentials in image URL are not allowed';
    }

    return null;
  } catch {
    return 'Invalid image URL';
  }
}

// OrionTV 兼容接口；仅代理豆瓣海报，避免成为任意公网代理。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  const invalidReason = validateDoubanImageUrl(imageUrl);
  if (invalidReason) {
    return NextResponse.json({ error: invalidReason }, { status: 400 });
  }

  try {
    const imageResponse = await fetch(imageUrl, {
      redirect: 'follow',
      headers: {
        Referer: 'https://movie.douban.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: imageResponse.statusText || 'Upstream image request failed' },
        { status: imageResponse.status }
      );
    }

    const contentType = imageResponse.headers.get('content-type');
    if (!contentType?.toLowerCase().startsWith('image/')) {
      imageResponse.body?.cancel();
      return NextResponse.json(
        { error: 'Upstream response is not an image' },
        { status: 415 }
      );
    }

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'public, max-age=15720000, s-maxage=15720000');
    headers.set('CDN-Cache-Control', 'public, s-maxage=15720000');
    headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=15720000');

    return new Response(imageResponse.body, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: 'Error fetching image' },
      { status: 500 }
    );
  }
}
