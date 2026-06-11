import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PANEL_PATHS = ['/panel/login', '/panel/set-password']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PANEL_PATHS.some(p => pathname === p || pathname === `${p}/`)) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Copiar las cookies (rotadas o expiradas por un refresh fallido) al redirect,
    // si no el navegador conserva cookies muertas y repite el refresh condenado
    const redirect = NextResponse.redirect(new URL('/panel/login', request.url))
    response.cookies.getAll().forEach(c => redirect.cookies.set(c))
    return redirect
  }
  return response
}

export const config = {
  matcher: ['/panel/:path*'],
}
