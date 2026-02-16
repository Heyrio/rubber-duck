export function connectGemini(geminiKey: string) {
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiKey}`
  const ws = new WebSocket(wsUrl)
  return ws
}




