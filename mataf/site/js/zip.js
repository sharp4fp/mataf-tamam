// Minimal ZIP reader: end-of-central-directory scan, central directory walk,
// methods 0 (stored) and 8 (raw deflate via DecompressionStream).
// No external dependencies; runs fully in the browser.

function findEocd(view) {
    // Search backwards for the EOCD signature 0x06054b50 within the last 64KB + 22.
    const min = Math.max(0, view.byteLength - 65557);
    for (let i = view.byteLength - 22; i >= min; i--) {
        if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
}

async function inflate(raw) {
    const DS = globalThis.DecompressionStream;
    if (!DS) throw new Error('הדפדפן לא תומך בפתיחת ZIP (DecompressionStream)');
    const body = new Blob([raw]).stream().pipeThrough(new DS('deflate-raw'));
    const ab = await new Response(body).arrayBuffer();
    return new Uint8Array(ab);
}

function decodeName(bytes, utf8) {
    try {
        return new TextDecoder(utf8 ? 'utf-8' : 'windows-1255').decode(bytes);
    } catch {
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
}

export async function readZip(buf) {
    const view = new DataView(buf);
    const eocd = findEocd(view);
    if (eocd < 0) throw new Error('לא נמצאה תוכנית ZIP תקינה (EOCD)');
    let count = view.getUint16(eocd + 10, true);
    let cdOff = view.getUint32(eocd + 16, true);
    // ZIP64 is not supported by this prototype reader.
    if (count === 0xffff || cdOff === 0xffffffff) throw new Error('קבצי ZIP64 לא נתמכים באב-הטיפוס');
    const entries = [];
    let p = cdOff;
    while (count-- > 0 && p + 46 <= view.byteLength) {
        if (view.getUint32(p, true) !== 0x02014b50) break;
        const flags = view.getUint16(p + 8, true);
        const method = view.getUint16(p + 10, true);
        const compSize = view.getUint32(p + 20, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localOff = view.getUint32(p + 42, true);
        const nameBytes = new Uint8Array(buf, p + 46, nameLen);
        const name = decodeName(nameBytes, (flags & 0x800) !== 0);
        p += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/')) continue; // directory entry
        if (method !== 0 && method !== 8) continue; // unsupported compression; skip entry
        // Local header: re-read variable lengths from it (they may differ from central).
        if (view.getUint32(localOff, true) !== 0x04034b50) continue;
        const lNameLen = view.getUint16(localOff + 26, true);
        const lExtraLen = view.getUint16(localOff + 28, true);
        const dataStart = localOff + 30 + lNameLen + lExtraLen;
        const raw = new Uint8Array(buf, dataStart, compSize);
        const data = method === 0 ? raw.slice() : await inflate(raw);
        entries.push({ name, data });
    }
    return entries;
}
