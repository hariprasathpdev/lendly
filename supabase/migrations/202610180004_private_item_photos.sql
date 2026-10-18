insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('item-photos','item-photos',false,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- No end-user storage policies are created. The bucket stays private; the API
-- validates ownership and file content before server-side uploads and issues
-- short-lived signed URLs only for approved listings.
