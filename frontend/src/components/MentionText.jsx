const mentionRegex = /(@[\w-]+)/g

export default function MentionText({ text }) {
  const parts = text.split(mentionRegex)

  return (
    <span>
      {parts.map((part, index) => {
        if (part.startsWith('@')) {
          return (
            <span key={`${part}-${index}`} className="mention">
              {part}
            </span>
          )
        }
        return <span key={`${part}-${index}`}>{part}</span>
      })}
    </span>
  )
}
