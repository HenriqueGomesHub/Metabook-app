-- v1.3: crop while curating. The curator keeps part of a photo (to cut out road signs, place
-- names and other giveaways); the collect job applies it when it copies the photo to approved/.
-- {x, y, w, h}: fractions 0..1 of the candidate image (left, top, width, height); null keeps it whole.
alter table media_candidates add column if not exists crop jsonb;

-- admins may set it like the other curation columns (the admin_update RLS policy still applies)
grant update (crop) on media_candidates to authenticated;
