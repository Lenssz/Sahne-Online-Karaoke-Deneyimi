begin;

-- The YouTube video is a visual guide only. Audio still comes from the
-- approved instrumental, and the final render still uses the private clip.
alter table public.songs
  add column lyric_video_youtube_id text
    check (lyric_video_youtube_id is null or lyric_video_youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column lyric_video_offset_ms integer not null default 0
    check (lyric_video_offset_ms between -30000 and 30000);

-- Link supplied for the existing Manifest / Daha İyi song.
update public.songs
  set lyric_video_youtube_id = '1Z4XPjQzij0'
  where lower(trim(title)) = 'daha iyi'
    and lower(trim(artist)) = 'manifest'
    and lyric_video_youtube_id is null;

commit;
