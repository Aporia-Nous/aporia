// APORIA: initials avatar.
function initials(name: string) {
  return name.replace(/[^a-z0-9 ]/gi, " ").trim().slice(0, 2).toUpperCase() || "AN"
}

export function Avatar(props: { name: string; size?: number }) {
  return (
    <span class="ap-avatar" style={{ width: `${props.size ?? 32}px`, height: `${props.size ?? 32}px` }}>
      {initials(props.name)}
    </span>
  )
}

