import { useEffect, useRef, useState } from "react";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 4096;
const MAX_PIXELS = 4096 * 2160;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MIME = ["image/png", "image/jpeg", "image/webp"];

export const isBackgroundId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

export function sharedBackgroundURL(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
    ? `/api/v1/public/background/${value}`
    : null;
}

export async function prepareBackground(file: File): Promise<Blob> {
  if (!file.size || file.size > MAX_BYTES)
    throw new Error("Invalid background");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (byte, index) => bytes[index] === byte,
  );
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  const type = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : webp
        ? "image/webp"
        : "";
  if (!type) throw new Error("Invalid background");
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (
      !width ||
      !height ||
      width > MAX_SIDE ||
      height > MAX_SIDE ||
      width * height > MAX_PIXELS
    )
      throw new Error("Invalid background dimensions");
  } finally {
    URL.revokeObjectURL(url);
  }
  return blob;
}

export type BackgroundDraft =
  | { kind: "keep" | "site" | "none" }
  | { kind: "file"; image: Blob; url: string };

export function useBackgroundDraft(onChange: () => void) {
  const [selection, setSelection] = useState<BackgroundDraft>({ kind: "keep" });
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (selection.kind === "file") URL.revokeObjectURL(selection.url);
    },
    [selection],
  );
  const choose = async (file: File | undefined) => {
    if (!file) return;
    const current = ++version.current;
    onChange();
    setLoading(true);
    try {
      const image = await prepareBackground(file);
      if (current !== version.current) return;
      const url = URL.createObjectURL(image);
      setSelection({ kind: "file", image, url });
      setInvalid(false);
    } catch {
      if (current === version.current) setInvalid(true);
    } finally {
      if (current === version.current) setLoading(false);
    }
  };
  const select = (kind: "keep" | "site" | "none") => {
    version.current++;
    onChange();
    setSelection({ kind });
    setInvalid(false);
    setLoading(false);
  };
  return { selection, invalid, loading, choose, select };
}

export async function backgroundBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(value);
}

function openBackgrounds(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nexa-backgrounds", 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Background storage is blocked"));
    };
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openBackgrounds();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("images", mode);
      const request = operation(transaction.objectStore("images"));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function readPersonalBackground(id: string): Promise<Blob | null> {
  if (!isBackgroundId(id)) return null;
  const value: unknown = await transact("readonly", (store) => store.get(id));
  return value instanceof Blob &&
    value.size > 0 &&
    value.size <= MAX_BYTES &&
    MIME.includes(value.type)
    ? value
    : null;
}

export async function savePersonalBackground(
  id: string,
  image: Blob,
): Promise<void> {
  if (
    !isBackgroundId(id) ||
    !image.size ||
    image.size > MAX_BYTES ||
    !MIME.includes(image.type)
  )
    throw new Error("Invalid background");
  await transact("readwrite", (store) => store.put(image, id));
}

export async function removePersonalBackground(id: string): Promise<void> {
  if (!isBackgroundId(id)) return;
  await transact("readwrite", (store) => store.delete(id));
}
