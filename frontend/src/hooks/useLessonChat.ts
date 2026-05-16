import { useState, useCallback } from 'react'
import type { ChatMessage, LessonChatFinalizeResponse } from '@/types/profile'

interface UseLessonChatOptions {
  applicationId: number
}

interface UseLessonChatReturn {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
  error: string | null
  sendMessage: (userText: string) => void
  finalize: () => Promise<LessonChatFinalizeResponse>
  clearConversation: () => void
}

export function useLessonChat({ applicationId }: UseLessonChatOptions): UseLessonChatReturn {
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
          const res = await fetch(`/api/v1/applications/${applicationId}/lesson-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: nextMessages, finalize: false }),
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
    [isStreaming, messages, applicationId],
  )

  const finalize = useCallback(async (): Promise<LessonChatFinalizeResponse> => {
    const res = await fetch(`/api/v1/applications/${applicationId}/lesson-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, finalize: true }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string }
      throw new Error(err.detail ?? `lesson finalize ${res.status}`)
    }
    return res.json() as Promise<LessonChatFinalizeResponse>
  }, [applicationId, messages])

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
    finalize,
    clearConversation,
  }
}
