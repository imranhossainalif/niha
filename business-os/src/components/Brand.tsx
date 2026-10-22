// EasyFounder logo: green on light backgrounds, white in dark mode.
export function Brand({ height = 36 }: { height?: number }) {
  return (
    <picture>
      <source srcSet="/brand/logo-white.png" media="(prefers-color-scheme: dark)" />
      <img src="/brand/logo.png" alt="EasyFounder" style={{ height, width: 'auto', display: 'block' }} />
    </picture>
  );
}
