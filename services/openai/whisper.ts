import OpenAI from 'openai'

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const ext = mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('mpeg') ? 'mp3'
    : 'ogg'

  const file = new File([new Uint8Array(buffer)], `audio.${ext}`, { type: mimeType })

  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'es',
  })

  return transcription.text
}
