import { CLUE_FAMILIES } from '@metabook/core';
import type { ClueFamily, ClueImage, ClueImageOverride } from '@metabook/core';
import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../app/AppData';
import type { AppSnapshot } from '../app/AppData';
import { label, SUBJECTS } from '../app/labels';
import { Button } from '../components/Button';
import { ClueImg } from '../components/clues/ClueImg';
import { CropBox } from '../components/CropBox';
import { EmptyState } from '../components/EmptyState';
import { Status } from '../components/Status';
import { useClueImageUrl } from '../data/clueImages';
import type { Crop, CurationApi } from '../data/curation';
import { Page } from './manage/Page';
import './curate/curate.css';

const PAGE = 48;

const familyLabel = (family: ClueFamily) =>
  family === 'other' ? 'Other clues' : SUBJECTS[family].label;

/** /curate: admins hide clue images or crop them for drills. Cloud mode only. */
export function Curate() {
  const { data, error, curation: api } = useAppData();
  const [admin, setAdmin] = useState<boolean | null>(api ? null : false);

  useEffect(() => {
    if (!api) return;
    let live = true;
    api.isAdmin().then(
      (yes) => live && setAdmin(yes),
      () => live && setAdmin(false),
    );
    return () => {
      live = false;
    };
  }, [api]);

  if (!data || admin === null) return <Status error={error} />;
  if (!admin || !api) {
    return (
      <Page user={data.user} title="Curate clue images">
        <EmptyState
          title="Admins only"
          text="Image curation needs cloud mode and an app_admins row for your account."
          actions={[{ label: 'Back to Settings', to: '/settings' }]}
        />
      </Page>
    );
  }
  return <ImageReview api={api} data={data} />;
}

interface Item {
  image: ClueImage;
  clueId: string;
  clueTitle: string;
  country: string;
}

function ImageReview({ api, data }: { api: CurationApi; data: AppSnapshot }) {
  const { refreshContent } = useAppData();
  const catalogue = data.content.clues;
  const families = CLUE_FAMILIES.filter((f) =>
    catalogue.some((c) => c.clues.some((clue) => clue.family === f && clue.images.length > 0)),
  );
  const [family, setFamily] = useState<ClueFamily | ''>(families[0] ?? '');
  const [country, setCountry] = useState('');
  const [giveawaysOnly, setGiveawaysOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [overrides, setOverrides] = useState(
    () => new Map(data.content.clueOverrides.map((o) => [o.imageId, o])),
  );
  const [cropping, setCropping] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const countries = useMemo(
    () =>
      catalogue
        .filter((c) => c.clues.some((clue) => clue.family === family && clue.images.length > 0))
        .map((c) => c.country.toUpperCase())
        .sort((a, b) => label(a).localeCompare(label(b))),
    [catalogue, family],
  );
  const items = useMemo(
    () =>
      catalogue
        .filter((c) => !country || c.country.toUpperCase() === country)
        .flatMap((c) =>
          c.clues
            .filter((clue) => clue.family === family)
            .flatMap((clue) =>
              clue.images
                .filter((image) => !giveawaysOnly || image.giveaway)
                .map((image) => ({
                  image,
                  clueId: clue.id,
                  clueTitle: clue.title,
                  country: c.country.toUpperCase(),
                })),
            ),
        ),
    [catalogue, country, family, giveawaysOnly],
  );

  /** What the image currently looks like in drills: the override over the catalogue. */
  const current = (item: Item): ClueImageOverride =>
    overrides.get(item.image.id) ?? {
      imageId: item.image.id,
      clueId: item.clueId,
      crop: null,
      hidden: false,
    };
  const cropOf = (item: Item): Crop | null => current(item).crop ?? item.image.crop ?? null;

  async function save(next: ClueImageOverride) {
    setBusy(true);
    setError('');
    try {
      await api.saveImageOverride(next);
      setOverrides((map) => new Map(map).set(next.imageId, next));
      await refreshContent();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (families.length === 0) {
    return (
      <Page user={data.user} title="Curate clue images">
        <EmptyState
          title="No clue images yet"
          text="They appear here once the content pipeline has written content/clues."
        />
      </Page>
    );
  }

  return (
    <Page
      user={data.user}
      title="Curate clue images"
      subtitle="Hide an image from drills, or crop away what gives the country away."
    >
      <div className="curate-filters">
        <select
          className="input"
          aria-label="Family"
          value={family}
          onChange={(e) => {
            setFamily(e.target.value as ClueFamily);
            setCountry('');
            setShown(PAGE);
          }}
        >
          {families.map((f) => (
            <option key={f} value={f}>
              {familyLabel(f)}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setShown(PAGE);
          }}
        >
          <option value="">All countries</option>
          {countries.map((code) => (
            <option key={code} value={code}>
              {label(code)}
            </option>
          ))}
        </select>
        <label className="curate-check">
          <input
            type="checkbox"
            checked={giveawaysOnly}
            onChange={(e) => setGiveawaysOnly(e.target.checked)}
          />
          Giveaways only
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="note">
        {items.length} {items.length === 1 ? 'image' : 'images'}
      </p>
      <ul className="curate-images">
        {items.slice(0, shown).map((item) => {
          const state = current(item);
          const crop = cropOf(item);
          return (
            <li
              key={`${item.clueId}:${item.image.id}`}
              className={state.hidden ? 'curate-image hidden' : 'curate-image'}
            >
              <div className="curate-thumb">
                <ClueImg
                  image={crop ? { ...item.image, crop } : item.image}
                  alt={`${label(item.country)}: ${item.clueTitle}`}
                  fit="contain"
                  cropped
                />
              </div>
              <div className="curate-info">
                <span className="curate-country">{label(item.country)}</span>
                <span className="muted small">{item.clueTitle}</span>
                <span className="curate-badges">
                  {item.image.giveaway && <span className="clue-chip">Giveaway</span>}
                  {crop && <span className="clue-chip">Cropped</span>}
                  {state.hidden && <span className="clue-chip">Hidden</span>}
                </span>
              </div>
              <div className="curate-buttons">
                <button
                  type="button"
                  className="toggle"
                  aria-pressed={state.hidden}
                  disabled={busy}
                  onClick={() => save({ ...state, hidden: !state.hidden })}
                >
                  {state.hidden ? 'Show in drills' : 'Hide'}
                </button>
                <button
                  type="button"
                  className="toggle"
                  disabled={busy}
                  onClick={() => setCropping(item)}
                >
                  Crop
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > shown && (
        <Button variant="ghost" onClick={() => setShown(shown + PAGE)}>
          Show more
        </Button>
      )}
      {cropping && (
        <CropOverlay
          item={cropping}
          initial={cropOf(cropping)}
          busy={busy}
          onCancel={() => setCropping(null)}
          onConfirm={async (crop) => {
            const ok = await save({ ...current(cropping), crop });
            if (ok) setCropping(null);
          }}
        />
      )}
    </Page>
  );
}

function CropOverlay({
  item,
  initial,
  busy,
  onConfirm,
  onCancel,
}: {
  item: Item;
  initial: Crop | null;
  busy: boolean;
  onConfirm(crop: Crop | null): void;
  onCancel(): void;
}) {
  const src = useClueImageUrl(item.image);
  return (
    <div className="grid-overlay" role="dialog" aria-modal="true" aria-label="Crop image">
      <div className="grid-overlay-card">
        {src ? (
          <CropBox
            src={src}
            alt={`${label(item.country)}: ${item.clueTitle}`}
            initial={initial}
            size={{ width: item.image.width ?? null, height: item.image.height ?? null }}
            busy={busy}
            confirmLabel="Save crop"
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : (
          <Status error={null} />
        )}
      </div>
    </div>
  );
}
