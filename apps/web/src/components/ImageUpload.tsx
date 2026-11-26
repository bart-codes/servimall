import { useState } from 'react';
import { api, thumb } from '../api';
import { Notice } from './ui';

interface Sign { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string }

/** Uploads straight to Cloudinary with a signature from our API, and returns the image URL. */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
  if (file.size > 5 * 1024 * 1024) throw new Error('Images must be under 5 MB');
  const s = await api<Sign>('/uploads/sign', { body: {} });
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', s.apiKey);
  fd.append('timestamp', String(s.timestamp));
  fd.append('folder', s.folder);
  fd.append('signature', s.signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) throw new Error(data?.error?.message ?? 'Upload failed. Try again.');
  return data.secure_url as string;
}

export default function ImageUpload({ value, onChange, max = 1, label }: { value: string[]; onChange: (urls: string[]) => void; max?: number; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try { onChange([...value, await uploadImage(file)].slice(0, max)); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((u) => (
          <div key={u} className="relative">
            <img src={thumb(u, 160, 120)} alt="" className="h-20 w-28 rounded-md border border-mist object-cover" />
            <button type="button" aria-label="Remove image" className="absolute -right-2 -top-2 rounded-full border border-mist bg-white px-1.5 text-sm" onClick={() => onChange(value.filter((x) => x !== u))}>x</button>
          </div>
        ))}
      </div>
      {value.length < max && (
        <label className="btn-ghost cursor-pointer">
          {busy ? 'Uploading...' : label}
          <input type="file" accept="image/*" className="sr-only" onChange={pick} disabled={busy} />
        </label>
      )}
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
