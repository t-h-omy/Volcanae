/**
 * Pink placeholder shown whenever a sprite path is empty, missing from
 * the registry, or when an `<img>` fails to load.
 */

export default function MissingSprite({ size }: { size: number }) {
  return (
    <div
      className="missing-sprite"
      style={{ width: size, height: size }}
    >
      ?
    </div>
  );
}
