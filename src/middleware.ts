import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Proteger rutas de votación
  if (pathname.startsWith('/votacion')) {
    const voterSession = request.cookies.get('voter_session')?.value;
    if (!voterSession) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Proteger rutas de administración (excepto el login de admin en /admin)
  if (pathname.startsWith('/admin') && pathname !== '/admin') {
    const adminSession = request.cookies.get('admin_session')?.value;
    if (!adminSession) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/votacion/:path*', '/admin/:path*'],
};
