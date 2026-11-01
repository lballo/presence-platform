const EMOJIS = [
  "😀", "😊", "😂", "🥰", "😍", "🤩", "😉", "😎", "🤔", "😮", "😢", "🙏", "👍", "👏", "🙌", "💪", "🤝", "👋", "✌️", "🫶",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🔥", "✨", "⭐", "🌟", "🎉", "🎊", "🏆", "🥇", "🎯", "🚀", "💡", "📣", "📢", "📌",
  "📅", "🗓️", "🎥", "🎤", "🎙️", "📚", "📝", "💼", "📈", "💰", "🌱", "🌿", "🌸", "☀️", "🌍", "☕", "🐝", "🏠", "💬", "🌈",
];

/** Petite palette d'emojis (sur téléphone, le clavier propose aussi les siens). */
export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(38px, 1fr))" }}>
      {EMOJIS.map((e) => <button key={e} type="button" aria-label={`Ajouter ${e}`} className="h-[38px] rounded-lg text-[20px] hover:bg-black/5 dark:hover:bg-white/10" onClick={() => onPick(e)}>{e}</button>)}
    </div>
  );
}
