import { useState, useCallback } from 'react'
import type { ChatMessage, ChatMode, ProposedUpdate } from '@/types/profile'

interface UseProfileChatOptions {
  sectionId: string
  mode: ChatMode
  sectionContent: string
  experienceLevel?: string
  modelId?: number | null
}

interface UseProfileChatReturn {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
  error: string | null
  sendMessage: (userText: string) => void
  proposeUpdate: () => Promise<ProposedUpdate>
  clearConversation: () => void
}

export function useProfileChat({
  sectionId,
  mode,
  sectionContent,
  experienceLevel,
  modelId,
}: UseProfileChatOptions): UseProfileChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    (userText: string) => {
      if (isStreaming) return

      const userMessage: ChatMessage = { role: 'user', content: userText }
      const nextMessages = [...messages, userMessage]
      setMessages(nextMessages)
      setStreamingContent('')
      setIsStreaming(true)
      setError(null)

      void (async () => {
        try {
          const res = await fetch('/api/v1/profile/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              section_id: sectionId,
              mode,
              messages: nextMessages,
              section_content: sectionContent,
              experience_level: experienceLevel,
              model_id: modelId ?? null,
            }),
          })

          if (!res.ok || !res.body) {
            setError(`Request failed: ${res.status}`)
            setIsStreaming(false)
            return
          }

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let accumulated = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const token = line.slice(6)

              if (token === '[DONE]') {
                setMessages(prev => [
                  ...prev,
                  { role: 'assistant', content: accumulated },
                ])
                setStreamingContent('')
                setIsStreaming(false)
                return
              }

              if (token === '[STREAM_ERROR]') {
                setError('Streaming error — please try again')
                setIsStreaming(false)
                return
              }

              accumulated += token
              setStreamingContent(accumulated)
            }
          }

          // Stream ended without [DONE] — treat accumulated content as complete
          if (accumulated) {
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: accumulated },
            ])
          }
          setStreamingContent('')
          setIsStreaming(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unknown error')
          setIsStreaming(false)
        }
      })()
    },
    [isStreaming, messages, sectionId, mode, sectionContent, experienceLevel, modelId],
  )

  const proposeUpdate = useCallback(async (): Promise<ProposedUpdate> => {
    const res = await fetch('/api/v1/profile/propose-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section_id: sectionId,
        mode,
        messages,
        section_content: sectionContent,
        experience_level: experienceLevel,
        model_id: modelId ?? null,
      }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string }
      throw new Error(err.detail ?? `propose update ${res.status}`)
    }
    return res.json() as Promise<ProposedUpdate>
  }, [sectionId, mode, messages, sectionContent, experienceLevel, modelId])

  const clearConversation = useCallback(() => {
    setMessages([])
    setStreamingContent('')
    setIsStreaming(false)
    setError(null)
  }, [])

  return {
    messages,
    streamingContent,
    isStreaming,
    error,
    sendMessage,
    proposeUpdate,
    clearConversation,
  }
}
