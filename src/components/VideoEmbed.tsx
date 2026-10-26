/** Lecteur vidéo : intègre YouTube, Vimeo, Loom et Google Drive, sinon lecteur natif. */
export const embedUrl = (url: string): string | null => {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const loom = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return null;
};

const looksLikeFile = (url: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes("/storage/v1/object/");

export function VideoEmbed({ url, title, onPlay, autoPlay }: { url: string; title?: string; onPlay?: () => void; autoPlay?: boolean }) {
  const embed = embedUrl(url);
  if (embed) return <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black"><iframe src={embed} title={title ?? "Vidéo"} className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={onPlay} /></div>;
  if (looksLikeFile(url)) return <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black"><video src={url} controls playsInline autoPlay={autoPlay} className="w-full h-full" onPlay={onPlay} /></div>;
  return <a href={url} target="_blank" rel="noopener" className="p-btn-outline p-btn-sm no-underline self-start">Voir la vidéo ↗</a>;
}
