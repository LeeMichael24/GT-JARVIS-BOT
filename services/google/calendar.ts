import { google } from 'googleapis'

const TZ = 'America/El_Salvador'

export interface MeetingEventParams {
  leadName: string
  leadPhone: string
  datetimeIso: string
  meetingType: 'visita_proyecto' | 'llamada' | 'videollamada'
  projectName?: string | null
  notes?: string | null
}

export interface CreatedEvent {
  eventId: string
  htmlLink: string
}

export async function createCalendarEvent(params: MeetingEventParams): Promise<CreatedEvent> {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n')

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })

  const calendar = google.calendar({ version: 'v3', auth })

  const start = new Date(params.datetimeIso)
  const end   = new Date(start.getTime() + 60 * 60 * 1000) // 1 hora por defecto

  const typeLabel: Record<MeetingEventParams['meetingType'], string> = {
    visita_proyecto: 'Visita al Proyecto',
    llamada:         'Llamada',
    videollamada:    'Videollamada',
  }

  const descLines = [
    `Lead: ${params.leadName}`,
    `Teléfono: +${params.leadPhone}`,
    params.projectName ? `Proyecto: ${params.projectName}` : null,
    params.notes       ? `Notas: ${params.notes}`           : null,
    '',
    'Agendado por Daniela (Bot GT)',
  ].filter((l): l is string => l !== null)

  const { data } = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID!,
    requestBody: {
      summary: `${typeLabel[params.meetingType]} GT — ${params.leadName}`,
      description: descLines.join('\n'),
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end:   { dateTime: end.toISOString(),   timeZone: TZ },
    },
  })

  return { eventId: data.id!, htmlLink: data.htmlLink! }
}
