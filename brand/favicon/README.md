# Favicon

Put all files in the website root, then add this to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1F6F4A">
```

- `favicon.ico`: 16, 32 and 48px in one file, for older browsers and Windows
- `favicon.svg`: sharp at any size, for modern browsers
- `apple-touch-icon.png` (180): iOS home screen, on the light-green tile
- `icon-192.png` / `icon-512.png` + `site.webmanifest`: Android and PWA
