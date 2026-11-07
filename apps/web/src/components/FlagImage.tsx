const FLAGS = import.meta.glob<string>('../../../../node_modules/svg-country-flags/svg/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const urlFor = (code: string) =>
  FLAGS[`../../../../node_modules/svg-country-flags/svg/${code.toLowerCase()}.svg`];

/** Flag proportions are written height:width, e.g. "2:3". Returns the CSS width / height. */
export function aspectFromRatio(ratio: string | undefined): string | undefined {
  const [h, w] = ratio?.split(':').map(Number) ?? [];
  return h && w ? `${w} / ${h}` : undefined;
}

export function FlagImage({ code, ratio, alt }: { code: string; ratio?: string; alt: string }) {
  const src = urlFor(code);
  if (!src) return <p className="flag-missing">No flag image for {code.toUpperCase()}</p>;
  return (
    <img
      className="flag-image"
      src={src}
      alt={alt}
      style={{ aspectRatio: aspectFromRatio(ratio) }}
    />
  );
}
