import type { ClueImageOverride, CropBox } from '@metabook/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** A crop as fractions 0..1 of the original image: left, top, width, height. */
export type Crop = CropBox;

/** Clue image review for admins (cloud mode, an app_admins row). */
export interface CurationApi {
  isAdmin(): Promise<boolean>;
  /** Writes one image's crop and hidden flag to `clue_image_overrides`. */
  saveImageOverride(override: ClueImageOverride): Promise<void>;
}

export function supabaseCuration(client: SupabaseClient): CurationApi {
  return {
    async isAdmin() {
      // RLS only lets a user read their own app_admins row
      const { data, error } = await client.from('app_admins').select('user_id').limit(1);
      return !error && (data?.length ?? 0) > 0;
    },
    async saveImageOverride({ imageId, clueId, crop, hidden }) {
      const { error } = await client.from('clue_image_overrides').upsert(
        {
          image_id: imageId,
          clue_id: clueId,
          crop,
          hidden,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'image_id' },
      );
      if (error) throw new Error(error.message);
    },
  };
}
