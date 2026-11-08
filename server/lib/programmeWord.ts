import zlib from "node:zlib";

/**
 * Remplit le modèle Word d'un programme de coaching (fichier « Programme type (Word) » de l'offre).
 * Appelé par n8n (workflow « Coaching · Inscription et programme ») sur POST /api/programme-word.
 * Chaque {{variable}} connue est remplacée et perd son surlignage jaune ; une variable vide est retirée.
 * Les {{variables}} inconnues et les passages surlignés restent tels quels, à ajuster à la main.
 * Aucune dépendance : lecture et écriture du ZIP avec zlib.
 */

type ZipEntry = { name: string; data: Buffer };

const MAX_TEMPLATE = 15 * 1024 * 1024;

// ---------- ZIP ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Fichier Word illisible (pas une archive ZIP)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Répertoire ZIP invalide");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`Compression ZIP non gérée (${method})`);
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---------- Remplissage ----------
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fillXml(xml: string, variables: Record<string, string>): string {
  // 1. Recoller les {{variables}} que Word a coupées entre plusieurs morceaux de texte
  let out = xml.replace(/\{\{((?:<[^>]+>|[^<{}])*?)\}\}/g, (_m: string, inner: string) => "{{" + inner.replace(/<[^>]+>/g, "") + "}}");

  // 2. Remplacer, morceau de texte par morceau de texte
  out = out.replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run: string) => {
    if (!run.includes("{{")) return run;
    let touched = false;
    let r = run.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m: string, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(variables, key)) return m;
      touched = true;
      return esc(variables[key] ?? "");
    });
    if (!touched) return r;
    if (!r.includes("{{")) r = r.replace(/<w:highlight [^>]*\/>/g, "");
    // un morceau devenu vide disparaît
    const text = (r.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t: string) => t.replace(/<[^>]+>/g, "")).join("");
    return text === "" ? "" : r;
  });

  // 3. Nettoyer les séparateurs orphelins (« , » sans rien après) laissés par une variable vide
  const sep = /<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?<w:t(?:\s[^>]*)?>, <\/w:t><\/w:r>/;
  let prev: string;
  do {
    prev = out;
    out = out.replace(new RegExp(sep.source + "(\\s*(?:" + sep.source + "|</w:p>))", "g"), "$1");
  } while (out !== prev);
  return out;
}

export function fillDocx(buf: Buffer, variables: Record<string, string>): Buffer {
  const entries = readZip(buf);
  for (const e of entries) {
    if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(e.name)) {
      e.data = Buffer.from(fillXml(e.data.toString("utf8"), variables), "utf8");
    }
  }
  return writeZip(entries);
}

/** Le modèle doit être un fichier hébergé par Notion : le module ne remplit que ce qu'on lui désigne. */
export function isNotionFile(url: string): boolean {
  let host = "";
  try { host = new URL(url).hostname; } catch { return false; }
  if (!/^https:\/\//.test(url)) return false;
  return (/(^|\.)amazonaws\.com$/.test(host) && /notion|prod-files-secure/.test(url)) || /(^|\.)notion\.(so|site|com)$/.test(host) || /(^|\.)notion-static\.com$/.test(host);
}

export async function fillProgramme(templateUrl: string, variables: Record<string, unknown>): Promise<Buffer> {
  const r = await fetch(templateUrl);
  if (!r.ok) throw new Error(`Modèle introuvable (${r.status})`);
  const tpl = Buffer.from(await r.arrayBuffer());
  if (tpl.length > MAX_TEMPLATE) throw new Error("Modèle trop lourd");
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(variables)) if (/^[a-zA-Z_]+$/.test(k)) clean[k] = v == null ? "" : String(v);
  return fillDocx(tpl, clean);
}
