// ─── Photo compression ────────────────────────────────────────────────────────
// A raw phone photo is 3–8 MB; as a base64 data URL it's ~33% larger again and
// sits in React state AND IndexedDB. Compressing on capture keeps the app fast
// and makes the eventual export/upload viable.
//
// Usage in App.jsx (replacing the old `addPhoto`):
//   const addPhoto = async (e) => {
//     const file = e.target.files[0];
//     if (!file) return;
//     const dataUrl = await compressImage(file);
//     setNotifFormPhotos(prev => [...prev, dataUrl]);
//     e.target.value = "";
//   };

export async function compressImage(file, { maxDim = 1280, quality = 0.7 } = {}) {
  // Read file into an <img>
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });

  // Scale down so the longest edge is at most maxDim.
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round(height * (maxDim / width));
      width = maxDim;
    } else {
      width = Math.round(width * (maxDim / height));
      height = maxDim;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  // JPEG keeps photos small; PNG would balloon for photographic content.
  return canvas.toDataURL("image/jpeg", quality);
}
