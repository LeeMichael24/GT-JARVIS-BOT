import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Cliente con la SESIÓN del miembro del equipo (anon key + cookies).
// Solo para leer la identidad; los datos se leen con service role en el servidor.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Llamado desde un Server Component sin response — el proxy refresca la sesión
          }
        },
      },
    }
  )
}
